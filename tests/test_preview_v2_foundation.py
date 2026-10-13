"""Offline safety tests for the empty-Preview foundation transaction."""
import base64
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

m = module("foundation", ROOT / "scripts/apply-preview-v2-foundation.py")
reader = module("catalog", ROOT / "scripts/read-preview-v2-schema.py")
PASSWORD = "ab" * 32
TOKEN = "synthetic-foundation-test-token"

def chunks():
    return [(ROOT / "backend/migrations/versions" / name).read_text() for name, _ in m.MIGRATIONS]

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
    result["relation_count"] = len(m.TABLES)
    result["relations"] = [dict(name=name, schema="public", kind="r", owner="khedmah_migrator",
        runtime_select=False, runtime_insert=False, runtime_update=False, runtime_delete=False)
        for name in m.TABLES]
    return result

class SourceTests(unittest.TestCase):
    def test_reviewed_sources_and_manifest_match_exact_blobs(self):
        parts = chunks()
        self.assertEqual(len(parts),22)
        for (_, sha), sql in zip(m.MIGRATIONS,parts):
            data=sql.encode()
            self.assertEqual(hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest(),sha)
        self.assertEqual(hashlib.sha256("".join(parts).encode()).hexdigest(),m.MANIFEST_SHA256)
        self.assertEqual(hashlib.sha256((ROOT/"scripts/read-preview-v2-schema.py").read_bytes()).hexdigest(),m.READER_SHA256)

    def test_blob_response_identity_size_and_bytes_checked(self):
        data=b"canonical-source"
        sha=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
        response=dict(sha=sha,size=len(data),encoding="base64",content=base64.b64encode(data).decode())
        def run(value):
            with patch.object(m.subprocess,"run",return_value=subprocess.CompletedProcess([],0,json.dumps(value).encode(),b"")) as call:
                value=m.fetch_blob(sha)
            self.assertEqual(call.call_args.args[0][:4],["gh","api","--hostname","github.com"])
            return value
        self.assertEqual(run(response),data)
        for change in ({"sha":"f"*40},{"size":999},{"content":base64.b64encode(b"changed").decode()},{"encoding":"utf8"}):
            with self.assertRaises(SystemExit): run({**response,**change})

    def test_source_failures_do_not_echo_tool_output(self):
        with patch.object(m.subprocess,"run",return_value=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)):
            with self.assertRaises(SystemExit) as caught:m.fetch_blob("a"*40)
        self.assertNotIn(TOKEN,str(caught.exception))
        self.assertNotIn(PASSWORD,str(caught.exception))

    def test_sources_verified_before_import(self):
        with tempfile.TemporaryDirectory() as d, patch.object(m,"fetch_blob",return_value=b"print('bad')"):
            with patch.object(m.importlib.util,"spec_from_file_location") as importer:
                with self.assertRaisesRegex(SystemExit,"READER_CHECKSUM"):m.load_sources(Path(d))
                importer.assert_not_called()

    def test_modified_reordered_or_missing_sql_refused(self):
        parts=chunks()
        for value in (parts[:-1],list(reversed(parts)),["--changed\n"+parts[0],*parts[1:]]):
            with self.assertRaisesRegex(SystemExit,"MANIFEST"):m.build_sql(value)

class BaselineTests(unittest.TestCase):
    def test_expected_empty_database_passes(self):
        m.validate_baseline(baseline())

    def test_existing_or_incomplete_database_cannot_replay(self):
        for change in (dict(relation_count=1),dict(relations=[{}]),dict(routine_count=1),
                       dict(relation_inventory_complete=False),dict(schemas=[])):
            with self.assertRaisesRegex(SystemExit,"NOT_EMPTY"):m.validate_baseline({**baseline(),**change})

    def test_role_flags_membership_and_privilege_drift_refused(self):
        for mutate in (lambda v:v["roles"][0].update(super=True),
                       lambda v:v["roles"][1].update(bypassrls=True),
                       lambda v:v["memberships"][0].update(admin=True),
                       lambda v:v["database_privileges"][0].update(create=True)):
            value=baseline();mutate(value)
            with self.assertRaises(SystemExit):m.validate_baseline(value)

class TransactionTests(unittest.TestCase):
    def test_atomic_canonical_order_and_in_transaction_preconditions(self):
        parts=chunks();sql=m.build_sql(parts)
        self.assertLess(sql.index("pg_advisory_xact_lock"),sql.index("FOUNDATION_DATABASE_NOT_EMPTY"))
        self.assertLess(sql.index("FOUNDATION_DATABASE_NOT_EMPTY"),sql.index(parts[0]))
        cursor=0
        for part in parts:
            cursor=sql.index(part,cursor)+len(part)
        self.assertLess(cursor,sql.index("FOUNDATION_POSTCONDITION_FAILED"))
        self.assertLess(sql.index("FOUNDATION_RUNTIME_GRANTS_UNEXPECTED"),sql.index("COMMIT;"))
        self.assertEqual(sql.count("COMMIT;"),1)
        self.assertEqual(len(m.TABLES),35)
        self.assertNotIn("GRANT ",sql)
        self.assertNotIn("ALTER ROLE",sql)
        self.assertNotIn("\\ir",sql)

    def invoke(self, result=None, error=None, sql_chunks=None):
        with tempfile.TemporaryDirectory() as d:
            work=Path(d)
            def fake_run(args,**kwargs):
                file=work/"foundation.pgpass"
                self.assertEqual(stat.S_IMODE(file.stat().st_mode),0o600)
                host=str(work/reader.CONNECTION).replace(":", "\\:")
                self.assertEqual(file.read_text(),host+":5432:khedmah:khedmah_migrator:"+PASSWORD+"\n")
                self.assertEqual(args[args.index("-U")+1],"khedmah_migrator")
                self.assertEqual(args[args.index("-d")+1],"khedmah")
                self.assertEqual(args[args.index("-h")+1],str(work/reader.CONNECTION))
                self.assertNotIn(PASSWORD," ".join(args))
                self.assertNotIn("PGPASSWORD",kwargs["env"])
                self.assertNotIn("PGSERVICE",kwargs["env"])
                self.assertIn("default_transaction_read_only=on",kwargs["env"]["PGOPTIONS"])
                self.assertIn("BEGIN READ WRITE;",kwargs["input"])
                self.assertIn("COMMIT;",kwargs["input"])
                self.assertTrue(kwargs["capture_output"])
                if error:raise error
                return result or subprocess.CompletedProcess(args,0,"PREVIEW_V2_FOUNDATION_COMMIT_ACK\n","")
            with patch.dict(m.os.environ,{"PGPASSWORD":PASSWORD,"PGSERVICE":"foreign"}):
                with patch.object(m.subprocess,"run",side_effect=fake_run):
                    try:m.execute_foundation(reader,work,PASSWORD,chunks() if sql_chunks is None else sql_chunks)
                    finally:self.assertFalse((work/"foundation.pgpass").exists())

    def test_write_is_only_pinned_transaction_and_private_passfile_cleaned(self):
        self.invoke()

    def test_error_timeout_and_missing_ack_never_retry_or_echo(self):
        for params in (dict(result=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)),
                       dict(result=subprocess.CompletedProcess([],0,"",TOKEN)),
                       dict(error=subprocess.TimeoutExpired(TOKEN,600))):
            with self.assertRaisesRegex(SystemExit,"UNCONFIRMED") as caught:self.invoke(**params)
            self.assertNotIn(PASSWORD,str(caught.exception));self.assertNotIn(TOKEN,str(caught.exception))

    def test_invalid_sql_never_creates_passfile_or_executes(self):
        with tempfile.TemporaryDirectory() as d,patch.object(m.subprocess,"run") as run:
            with self.assertRaises(SystemExit):m.execute_foundation(reader,Path(d),PASSWORD,[])
            self.assertEqual(list(Path(d).iterdir()),[])
            run.assert_not_called()

    def test_postcondition_requires_all_tables_owner_and_no_early_grants(self):
        m.verify_result(postcondition())
        for mutate in (lambda v:v.update(relation_count=34),lambda v:v.update(routine_count=1),
                       lambda v:v["relations"][0].update(owner="postgres"),
                       lambda v:v["relations"][0].update(runtime_select=True),
                       lambda v:v["relations"][0].update(name="foreign")):
            value=postcondition();mutate(value)
            with self.assertRaisesRegex(SystemExit,"NO_REPLAY"):m.verify_result(value)

class OrchestrationTests(unittest.TestCase):
    def run_mocked(self, before=None, execute_error=None, after=None, version=None):
        fake=Mock()
        fake.CONNECTION=reader.CONNECTION;fake.PROJECT=reader.PROJECT;fake.INSTANCE=reader.INSTANCE
        fake.SECRET=reader.SECRET;fake.RESOURCE=reader.RESOURCE
        fake.cloud.side_effect=[{}, version if version is not None else dict(name=reader.RESOURCE,state="ENABLED"),TOKEN.encode()]
        fake.read_password.return_value=PASSWORD
        fake.read_catalog.side_effect=[baseline() if before is None else before,postcondition() if after is None else after]
        fake.proxy_environment.return_value={"CSQL_PROXY_TOKEN":TOKEN}
        proxy=Mock();proxy.poll.return_value=None
        works=[]
        def popen(args,**kwargs):
            self.assertEqual(args[:2],["cloud-sql-proxy",reader.CONNECTION])
            self.assertNotIn(TOKEN," ".join(args))
            work=Path(args[2].split("=",1)[1]);works.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode),0o700)
            (work/reader.CONNECTION).mkdir()
            (work/reader.CONNECTION/".s.PGSQL.5432").touch()
            return proxy
        output=io.StringIO()
        try:
            with patch.object(m.shutil,"which",return_value="/fake"),patch.object(m,"load_sources",return_value=(fake,chunks())):
                with patch.object(m.subprocess,"Popen",side_effect=popen),patch.object(m.stat,"S_ISSOCK",return_value=True):
                    with patch.object(m,"execute_foundation",side_effect=execute_error) as execute,contextlib.redirect_stdout(output):
                        try:m.apply_foundation()
                        finally:
                            self.last_execute=execute.call_count
                            self.last_calls=fake
            return [json.loads(line) for line in output.getvalue().splitlines()]
        finally:
            for work in works:
                self.assertFalse(work.exists())
                fake.stop_proxy.assert_called_once_with(proxy)
            self.assertNotIn(PASSWORD,output.getvalue());self.assertNotIn(TOKEN,output.getvalue())
            self.last_output=output.getvalue()

    def test_success_requires_preflight_single_write_and_readback(self):
        output=self.run_mocked()
        self.assertEqual(self.last_execute,1)
        self.assertEqual(output[-1]["stage"],"PREVIEW_V2_FOUNDATION_001_022_VERIFIED")
        self.assertTrue(output[-1]["schema_mutation"])
        self.assertFalse(output[-1]["runtime_grants_mutation"])
        self.assertFalse(output[-1]["full_schema_ready"])
        self.assertFalse(output[-1]["application_deployed"])
        self.assertEqual(self.last_calls.read_catalog.call_count,2)

    def test_nonempty_never_enters_write_and_cleans_proxy(self):
        with self.assertRaisesRegex(SystemExit,"NOT_EMPTY"):self.run_mocked(before=postcondition())
        self.assertEqual(self.last_execute,0)

    def test_failed_write_does_not_retry_or_claim_completion(self):
        with self.assertRaises(SystemExit):self.run_mocked(execute_error=SystemExit("STOP: UNCONFIRMED"))
        self.assertEqual(self.last_execute,1)
        self.assertNotIn("COMMIT_ACKNOWLEDGED",self.last_output)
        self.assertNotIn("001_022_VERIFIED",self.last_output)

    def test_bad_postcommit_readback_reports_no_full_success(self):
        with self.assertRaisesRegex(SystemExit,"NO_REPLAY"):self.run_mocked(after=baseline())
        self.assertIn("COMMIT_ACKNOWLEDGED",self.last_output)
        self.assertNotIn("001_022_VERIFIED",self.last_output)

    def test_disabled_secret_stops_before_credential_access(self):
        with self.assertRaisesRegex(SystemExit,"VERSION_ONE"):self.run_mocked(version=dict(name=reader.RESOURCE,state="DISABLED"))
        self.assertEqual(self.last_execute,0)
        self.last_calls.read_password.assert_not_called()

if __name__ == "__main__":
    unittest.main()
