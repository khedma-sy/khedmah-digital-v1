"""Offline guards for Preview migration 025; no cloud or database execution."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

m = module("classifieds", ROOT / "scripts/apply-preview-v2-classifieds.py")
foundation = module("foundation", ROOT / "scripts/apply-preview-v2-foundation.py")
reader = module("reader", ROOT / "scripts/read-preview-v2-schema.py")
PASSWORD = "ab" * 32
TOKEN = "synthetic-m24-test-token"
MIGRATION = (ROOT / "backend/migrations/versions/025_classifieds.sql").read_text()

def baseline():
    return dict(database="khedmah", user="khedmah_migrator", read_only="on",
        server_version_num=160015, relation_count=0, relations=[], relation_inventory_complete=True,
        routine_count=0, schemas=[dict(name="public", owner="pg_database_owner")],
        roles=[dict(name=name, login=name in ("khedmah_app","khedmah_migrator"),
                    super=False, createdb=False, createrole=False, replication=False, bypassrls=False)
               for name in reader.ROLES],
        memberships=[dict(admin=False, inherit=True, member="khedmah_app", role="khedmah_runtime_role", set=True),
                     dict(admin=False, inherit=True, member="khedmah_migrator", role="khedmah_migration_role", set=True)],
        database_privileges=[
            dict(connect=True, create=False, public_create=False, public_usage=True, role="khedmah_app", temp=False),
            dict(connect=True, create=True, public_create=True, public_usage=True, role="khedmah_migrator", temp=False)],
        default_acls=[])

def postcondition():
    result = baseline()
    result["relation_count"] = len(foundation.TABLES)
    result["relations"] = [dict(name=name, schema="public", kind="r", owner="khedmah_migrator",
        runtime_select=False, runtime_insert=False, runtime_update=False, runtime_delete=False)
        for name in foundation.TABLES]
    return result




def after_024():
    value = postcondition()
    value["relation_count"] = 36
    value["relations"].append(dict(name="product_listings",schema="public",kind="r",
        owner="khedmah_migrator",runtime_select=False,runtime_insert=False,runtime_update=False,runtime_delete=False))
    return value

def after_025():
    value = after_024()
    value['relation_count'] = 40
    value['routine_count'] = 3
    for name in m.AD_TABLES:
        value['relations'].append(dict(name=name,schema='public',kind='r',owner='khedmah_migrator',
            runtime_select=False,runtime_insert=False,runtime_update=False,runtime_delete=False))
    return value

class SourceTests(unittest.TestCase):
    def test_three_immutable_dependencies_match(self):
        for path, blob, sha in (
            ("scripts/apply-preview-v2-foundation.py",m.FOUNDATION_BLOB,m.FOUNDATION_SHA256),
            ("scripts/read-preview-v2-schema.py",m.READER_BLOB,m.READER_SHA256),
            ("backend/migrations/versions/025_classifieds.sql",m.MIGRATION_BLOB,m.MIGRATION_SHA256)):
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha)

    def test_modified_sql_or_module_stops_before_use(self):
        with self.assertRaisesRegex(SystemExit,"CHECKSUM"):m.build_sql(foundation,MIGRATION+"\n")
        with tempfile.TemporaryDirectory() as d,patch.object(m.importlib.util,"spec_from_file_location") as importer:
            with self.assertRaisesRegex(SystemExit,"CHECKSUM"):m.verified_module(Path(d),"bad",b"print('bad')",m.READER_SHA256)
            importer.assert_not_called()
            self.assertEqual(list(Path(d).iterdir()),[])

    def test_loaded_helpers_do_not_execute_their_apply_entrypoints(self):
        source_map={m.FOUNDATION_BLOB:(ROOT/"scripts/apply-preview-v2-foundation.py").read_bytes(),
                    m.READER_BLOB:(ROOT/"scripts/read-preview-v2-schema.py").read_bytes(),
                    m.MIGRATION_BLOB:MIGRATION.encode()}
        with tempfile.TemporaryDirectory() as d,patch.object(m,"fetch_blob",side_effect=source_map.__getitem__):
            with patch.object(subprocess,"run",side_effect=AssertionError("No subprocess during import")):
                f,r,sql=m.load_sources(Path(d))
        self.assertEqual(f.TABLES,foundation.TABLES)
        self.assertEqual(r.PROJECT,reader.PROJECT)
        self.assertEqual(sql,MIGRATION)

class GateTests(unittest.TestCase):
    def test_complete_024_is_required(self):
        m.validate_predecessor(foundation,after_024())
        for value in (baseline(),postcondition(),after_025(),{**after_024(),"relation_inventory_complete":False}):
            with self.assertRaises(SystemExit):m.validate_predecessor(foundation,value)

    def test_missing_wrong_owner_and_grant_drift_block(self):
        for mutate in (lambda v:v["relations"].pop(),lambda v:v["relations"][0].update(owner="postgres"),
                       lambda v:v["relations"][0].update(runtime_select=True),
                       lambda v:v["roles"][0].update(super=True),
                       lambda v:v["memberships"][0].update(admin=True),
                       lambda v:v["database_privileges"][0].update(public_create=True),
                       lambda v:v.update(schemas=[])):
            value=after_024();mutate(value)
            with self.assertRaises(SystemExit):m.validate_predecessor(foundation,value)

    def test_exact_postcondition_preserves_no_grants(self):
        m.verify_catalog(foundation,after_025(),applied=True)
        for mutate in (lambda v:v.update(relation_count=35),lambda v:v.update(routine_count=1),
                       lambda v:v["relations"][-1].update(name="ad_listings"),
                       lambda v:v["relations"][-1].update(runtime_insert=True)):
            value=after_025();mutate(value)
            with self.assertRaises(SystemExit):m.verify_catalog(foundation,value,applied=True)

    def test_sql_atomicity_and_pre_post_contract_order(self):
        sql=m.build_sql(foundation,MIGRATION)
        self.assertEqual(sql.count(MIGRATION),1)
        self.assertLess(sql.index("pg_advisory_xact_lock"),sql.index("MIGRATION_025_PREDECESSOR_DRIFT"))
        self.assertLess(sql.index("MIGRATION_025_PARTIAL_OR_PREDECESSOR_INVALID"),sql.index(MIGRATION))
        self.assertLess(sql.index(MIGRATION),sql.index("MIGRATION_025_POSTCONDITION_FAILED"))
        self.assertLess(sql.index("MIGRATION_025_CLASSIFIEDS_OR_MEDIA_CONTRACT_FAILED"),sql.index("COMMIT;"))
        self.assertEqual(sql.count("COMMIT;"),1)
        self.assertIn("BEGIN READ WRITE;",sql)
        for token in ("GRANT ","ALTER ROLE ","CREATE ROLE ","DROP TABLE ","INSERT INTO ","\\ir"):
            self.assertNotIn(token,sql)
        self.assertIn("product_listings_public_idx",sql)
        self.assertIn("c.convalidated",sql)

    def test_routine_and_trigger_guards_cover_behavior_and_access(self):
        sql=m.classifieds_contract(MIGRATION)
        for token in ('p.prosrc=e.body', "p.prorettype='pg_catalog.trigger'::regtype",
                      'NOT p.prosecdef', "acl.grantee=0", 'has_function_privilege',
                      "'khedmah_runtime_role'", "t.tgenabled='O'", 'e.eventtype=t.tgtype::integer',
                      't.tgqual IS NULL', 'i.indisvalid AND i.indisready',
                      'AD_FREE_QUOTA_EXHAUSTED', 'AD_IDENTITY_IMMUTABLE', 'AD_AUDIT_APPEND_ONLY'):
            self.assertIn(token,sql)
        self.assertEqual(len(m.TRIGGERS),5)
        self.assertEqual(sorted(row[3] for row in m.TRIGGERS),[7,19,27,27,27])

    def test_readback_reuses_full_postcondition_in_read_only_transaction(self):
        sql=m.build_readback_sql(foundation,MIGRATION)
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertIn(m.postcondition_sql(foundation,MIGRATION),sql)
        self.assertIn('ROLLBACK;',sql)
        for token in ('BEGIN READ WRITE','COMMIT;', 'CREATE FUNCTION', 'CREATE TABLE', 'GRANT '):
            self.assertNotIn(token,sql)

class ExecutionTests(unittest.TestCase):
    def invoke(self, error=None, result=None):
        with tempfile.TemporaryDirectory() as d:
            work=Path(d)
            def run(args,**kwargs):
                file=work/"classifieds.pgpass"
                self.assertEqual(stat.S_IMODE(file.stat().st_mode),0o600)
                self.assertIn(str(work/reader.CONNECTION).replace(":", "\\:"),file.read_text())
                self.assertEqual(args[args.index("-h")+1],str(work/reader.CONNECTION))
                self.assertEqual(args[args.index("-U")+1],reader.USER)
                self.assertEqual(args[args.index("-d")+1],reader.DATABASE)
                self.assertNotIn(PASSWORD," ".join(args))
                self.assertNotIn("PGPASSWORD",kwargs["env"])
                self.assertNotIn("PGSERVICE",kwargs["env"])
                self.assertTrue(kwargs["capture_output"])
                self.assertIn("default_transaction_read_only=on",kwargs["env"]["PGOPTIONS"])
                self.assertEqual(kwargs["input"],m.build_sql(foundation,MIGRATION))
                if error:raise error
                return result or subprocess.CompletedProcess(args,0,"PREVIEW_V2_CLASSIFIEDS_COMMIT_ACK\n","")
            with patch.dict(m.os.environ,{"PGPASSWORD":PASSWORD,"PGSERVICE":"foreign"}):
                with patch.object(m.subprocess,"run",side_effect=run) as call:
                    try:m.execute_sql(reader,work,PASSWORD,m.build_sql(foundation,MIGRATION),"PREVIEW_V2_CLASSIFIEDS_COMMIT_ACK")
                    finally:
                        self.assertEqual(call.call_count,1)
                        self.assertFalse((work/"classifieds.pgpass").exists())

    def test_private_write_session_and_cleanup(self):
        self.invoke()

    def test_failure_timeout_missing_ack_are_redacted_and_not_retried(self):
        for params in (dict(error=subprocess.TimeoutExpired(TOKEN,600)),
                       dict(result=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)),
                       dict(result=subprocess.CompletedProcess([],0,"",TOKEN))):
            with self.assertRaisesRegex(SystemExit,"UNCONFIRMED") as caught:self.invoke(**params)
            self.assertNotIn(PASSWORD,str(caught.exception));self.assertNotIn(TOKEN,str(caught.exception))

class OrchestrationTests(unittest.TestCase):
    def run_mocked(self,before=None,after=None,error=None,version=None):
        fake=Mock()
        for name in ("CONNECTION","PROJECT","INSTANCE","SECRET","RESOURCE","DATABASE"):
            setattr(fake,name,getattr(reader,name))
        fake.cloud.side_effect=[{},version if version is not None else dict(name=reader.RESOURCE,state="ENABLED"),TOKEN.encode()]
        fake.read_password.return_value=PASSWORD
        fake.read_catalog.side_effect=[after_024() if before is None else before,after_025() if after is None else after]
        fake.proxy_environment.return_value={"CSQL_PROXY_TOKEN":TOKEN}
        proxy=Mock();proxy.poll.return_value=None;works=[]
        def popen(args,**kwargs):
            self.assertEqual(args[:2],["cloud-sql-proxy",reader.CONNECTION])
            self.assertNotIn(TOKEN," ".join(args))
            work=Path(args[2].split("=",1)[1]);works.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode),0o700)
            (work/reader.CONNECTION).mkdir()
            (work/reader.CONNECTION/".s.PGSQL.5432").touch()
            return proxy
        out=io.StringIO()
        try:
            with patch.object(m.shutil,"which",return_value="/fake"),patch.object(m,"load_sources",return_value=(foundation,fake,MIGRATION)):
                with patch.object(m.subprocess,"Popen",side_effect=popen),patch.object(m.stat,"S_ISSOCK",return_value=True):
                    with patch.object(m,"execute_sql",side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_classifieds()
                        finally:self.last_execute=execute.call_count;self.last_reader=fake
            return [json.loads(line) for line in out.getvalue().splitlines()]
        finally:
            for work in works:
                self.assertFalse(work.exists());fake.stop_proxy.assert_called_once_with(proxy)
            self.assertNotIn(PASSWORD,out.getvalue());self.assertNotIn(TOKEN,out.getvalue())
            self.last_output=out.getvalue()

    def test_success_requires_fresh_full_catalog_and_compact_readback(self):
        result=self.run_mocked()
        final=result[-1]
        self.assertEqual(self.last_reader.read_catalog.call_count,2)
        self.assertEqual(self.last_execute,2)
        self.assertEqual(final["table_count"],40)
        self.assertEqual(final["routine_count"],3)
        self.assertEqual(final["trigger_count"],5)
        self.assertTrue(final["routine_trigger_contract_readback_verified"])
        self.assertEqual(final["stage"],"PREVIEW_V2_CLASSIFIEDS_025_VERIFIED")
        self.assertNotIn("catalog",final)
        self.assertFalse(final["runtime_grants_mutation"])
        self.assertFalse(final["application_deployed"])
        self.assertFalse(final["full_schema_ready"])

    def test_partial_or_completed_state_cannot_enter_write(self):
        for state in (baseline(),postcondition(),after_025()):
            with self.assertRaises(SystemExit):self.run_mocked(before=state)
            self.assertEqual(self.last_execute,0)

    def test_failed_write_never_retries_or_reports_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(error=SystemExit("STOP: UNCONFIRMED"))
        self.assertEqual(self.last_execute,1)
        self.assertNotIn("COMMIT_ACKNOWLEDGED",self.last_output)
        self.assertNotIn("025_VERIFIED",self.last_output)

    def test_invalid_readback_keeps_commit_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after=postcondition())
        self.assertIn("COMMIT_ACKNOWLEDGED",self.last_output)
        self.assertNotIn("025_VERIFIED",self.last_output)

    def test_supplemental_readback_failure_cannot_report_success(self):
        with self.assertRaises(SystemExit):
            self.run_mocked(error=[None,SystemExit('STOP: READBACK_UNCONFIRMED')])
        self.assertEqual(self.last_execute,2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.last_output)
        self.assertNotIn('025_VERIFIED',self.last_output)

    def test_disabled_secret_stops_before_payload(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=reader.RESOURCE,state="DISABLED"))
        self.assertEqual(self.last_execute,0)
        self.last_reader.read_password.assert_not_called()

if __name__ == "__main__":
    unittest.main()
