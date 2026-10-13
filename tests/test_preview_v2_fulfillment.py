"""Offline guards for the isolated 026-028 owner operation; no live database/cloud."""
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
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value

m=module('fulfillment',ROOT/'scripts/apply-preview-v2-fulfillment.py')
p=module('predecessor',ROOT/'scripts/apply-preview-v2-classifieds.py')
f=module('foundation',ROOT/'scripts/apply-preview-v2-foundation.py')
r=module('reader',ROOT/'scripts/read-preview-v2-schema.py')
SQL025=(ROOT/'backend/migrations/versions/025_classifieds.sql').read_text()
MIGRATIONS=[(ROOT/'backend/migrations/versions'/name).read_text() for name,blob,sha in m.MIGRATIONS]
PASSWORD='ab'*32
TOKEN='synthetic-m26-token'

def catalog(applied=False):
    names=m.tables(p,f,applied)
    return dict(database='khedmah',user='khedmah_migrator',read_only='on',server_version_num=160015,
        relation_count=len(names),routine_count=4 if applied else 3,relation_inventory_complete=True,
        schemas=[dict(name='public',owner='pg_database_owner')],default_acls=[],
        relations=[dict(name=name,schema='public',kind='r',owner='khedmah_migrator',
            runtime_select=False,runtime_insert=False,runtime_update=False,runtime_delete=False) for name in names],
        roles=[dict(name=name,login=name in ('khedmah_app','khedmah_migrator'),super=False,
                    createdb=False,createrole=False,replication=False,bypassrls=False) for name in r.ROLES],
        memberships=[dict(admin=False,inherit=True,member='khedmah_app',role='khedmah_runtime_role',set=True),
                     dict(admin=False,inherit=True,member='khedmah_migrator',role='khedmah_migration_role',set=True)],
        database_privileges=[
            dict(connect=True,create=False,public_create=False,public_usage=True,role='khedmah_app',temp=False),
            dict(connect=True,create=True,public_create=True,public_usage=True,role='khedmah_migrator',temp=False)])

class SourceTests(unittest.TestCase):
    def source_map(self):
        entries=[('scripts/apply-preview-v2-classifieds.py',m.PREDECESSOR_BLOB,m.PREDECESSOR_SHA256),
                 ('scripts/apply-preview-v2-foundation.py',p.FOUNDATION_BLOB,p.FOUNDATION_SHA256),
                 ('scripts/read-preview-v2-schema.py',p.READER_BLOB,p.READER_SHA256),
                 ('backend/migrations/versions/025_classifieds.sql',p.MIGRATION_BLOB,p.MIGRATION_SHA256)]
        entries += [('backend/migrations/versions/'+name,blob,sha) for name,blob,sha in m.MIGRATIONS]
        result={}
        for path,blob,sha in entries:
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha)
            result[blob]=data
        return result

    def test_all_seven_immutable_sources_match(self):
        self.assertEqual(len(self.source_map()),7)

    def test_tampered_or_reordered_migration_refused(self):
        for migrations in (MIGRATIONS[:2],MIGRATIONS[::-1],[MIGRATIONS[0]+'\n',*MIGRATIONS[1:]]):
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.build_sql(p,f,SQL025,migrations)
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(p,f,SQL025+'\n',MIGRATIONS)

    def test_import_and_load_only_fetch_sources_never_apply(self):
        sources=self.source_map()
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kwargs['capture_output'])
            self.assertNotIn('GH_DEBUG',kwargs['env'])
            response=dict(sha=blob,size=len(data),encoding='base64',content=base64.b64encode(data).decode())
            return subprocess.CompletedProcess(args,0,json.dumps(response).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):
                pp,ff,rr,old,migrations=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,7)
        self.assertEqual(migrations,MIGRATIONS);self.assertEqual(old,SQL025)
        self.assertEqual(rr.PROJECT,r.PROJECT);self.assertEqual(ff.TABLES,f.TABLES)

    def test_bad_dependency_stops_before_import(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.PREDECESSOR_SHA256)
            importer.assert_not_called()

class CatalogTests(unittest.TestCase):
    def test_exact_025_predecessor_rejects_partial_or_applied(self):
        p.verify_catalog(f,catalog(),applied=True)
        for value in (catalog(True),{**catalog(),'relation_count':39},{**catalog(),'routine_count':4},
                      {**catalog(),'relation_inventory_complete':False}):
            with self.assertRaises(SystemExit):p.verify_catalog(f,value,applied=True)

    def test_postcondition_owner_grant_role_and_schema_drift_rejected(self):
        m.verify_result(p,f,catalog(True))
        for mutate in (lambda v:v['relations'].pop(),lambda v:v['relations'][0].update(owner='postgres'),
                       lambda v:v['relations'][0].update(runtime_insert=True),lambda v:v.update(routine_count=3),
                       lambda v:v['roles'][0].update(super=True),lambda v:v['memberships'][0].update(admin=True),
                       lambda v:v['database_privileges'][0].update(create=True),lambda v:v.update(schemas=[])):
            v=catalog(True);mutate(v)
            with self.assertRaises(SystemExit):m.verify_result(p,f,v)

class SQLTests(unittest.TestCase):
    def test_atomic_canonical_order_and_precommit_verification(self):
        sql=m.build_sql(p,f,SQL025,MIGRATIONS)
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertNotIn(SQL025,sql)
        self.assertLess(sql.index('pg_advisory_xact_lock'),sql.index('LOCK TABLE public.media_assets'))
        self.assertLess(sql.index('LOCK TABLE public.media_assets'),sql.index('EXISTING_DOCUMENTS_REQUIRE_REVIEW'))
        self.assertLess(sql.index('PARTIAL_STATE_NO_REPLAY'),sql.index(MIGRATIONS[0]))
        for idx,migration in enumerate(MIGRATIONS):
            self.assertEqual(sql.count(migration),1)
            if idx:self.assertLess(sql.index(MIGRATIONS[idx-1]),sql.index(migration))
        self.assertLess(sql.index(MIGRATIONS[2]),sql.index('MIGRATIONS_026_028_POSTCONDITION_FAILED'))
        self.assertLess(sql.index('MIGRATIONS_026_028_MEDIA_PRIVACY_OR_CLASSIFIEDS_CONTRACT_FAILED'),sql.index('COMMIT;'))
        for token in ('GRANT ','ALTER ROLE ','CREATE ROLE ','DROP TABLE ','\\ir','legacy_165_reconcile'):
            self.assertNotIn(token,sql)

    def test_backfill_and_existing_driver_documents_are_explicit(self):
        sql=m.build_sql(p,f,SQL025,MIGRATIONS)
        self.assertIn('INSERT INTO mobility_document_reviews',MIGRATIONS[1])
        self.assertIn('ON CONFLICT (media_asset_id) DO NOTHING',MIGRATIONS[1])
        self.assertIn('SELECT 1 FROM public.media_assets',m.absence_contract())
        for value in ('driver_photo','identity_card','driving_license','vehicle_license'):
            self.assertIn(value,m.absence_contract())
        self.assertLess(sql.index('EXISTING_DOCUMENTS_REQUIRE_REVIEW'),sql.index(MIGRATIONS[1]))

    def test_full_readback_is_read_only_with_same_postconditions(self):
        sql=m.build_readback_sql(p,f,SQL025,MIGRATIONS)
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertIn(m.postcondition_sql(p,f,SQL025,MIGRATIONS),sql)
        self.assertIn('ROLLBACK;',sql)
        for value in ('COMMIT;','BEGIN READ WRITE;','LOCK TABLE','CREATE TABLE'):
            self.assertNotIn(value,sql)
        for migration in MIGRATIONS:self.assertNotIn(migration,sql)

    def test_all_four_bodies_six_triggers_and_privacy_contract_checked(self):
        sql=m.postcondition_sql(p,f,SQL025,MIGRATIONS)
        for token in ('p.prosrc=e.body','NOT p.prosecdef','acl.grantee=0',"'khedmah_runtime_role'",
                      "t.tgenabled='O'",'e.eventtype=t.tgtype::integer',"'create_pending_mobility_document_review',5",
                      'i.indisvalid AND i.indisready',"a.attgenerated='s'",'<> 13','<> 18',
                      'media_assets_driver_documents_private_check','AD_AUDIT_APPEND_ONLY'):
            self.assertIn(token,sql)

class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(p,f,SQL025,MIGRATIONS)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                file=work/'fulfillment.pgpass'
                self.assertEqual(stat.S_IMODE(file.stat().st_mode),0o600)
                self.assertIn(str(work/r.CONNECTION).replace(':','\\:'),file.read_text())
                self.assertEqual(args[args.index('-h')+1],str(work/r.CONNECTION))
                self.assertEqual(args[args.index('-U')+1],r.USER)
                self.assertEqual(args[args.index('-d')+1],r.DATABASE)
                self.assertNotIn(PASSWORD,' '.join(args));self.assertNotIn('PGPASSWORD',kwargs['env'])
                self.assertNotIn('PGSERVICE',kwargs['env']);self.assertTrue(kwargs['capture_output'])
                self.assertIn('default_transaction_read_only=on',kwargs['env']['PGOPTIONS'])
                self.assertEqual(kwargs['input'],sql)
                if error:raise error
                return result or subprocess.CompletedProcess(args,0,'PREVIEW_V2_FULFILLMENT_COMMIT_ACK\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}):
                with patch.object(m.subprocess,'run',side_effect=run) as calls:
                    try:m.execute_sql(r,work,PASSWORD,sql,'PREVIEW_V2_FULFILLMENT_COMMIT_ACK')
                    finally:
                        self.assertEqual(calls.call_count,1)
                        self.assertFalse((work/'fulfillment.pgpass').exists())

    def test_private_socket_credentials_and_cleanup(self):self.invoke()

    def test_failure_timeout_and_missing_ack_redacted_without_retry(self):
        for kwargs in (dict(error=subprocess.TimeoutExpired(TOKEN,600)),
                       dict(result=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)),
                       dict(result=subprocess.CompletedProcess([],0,'',TOKEN))):
            with self.assertRaisesRegex(SystemExit,'UNCONFIRMED') as error:self.invoke(**kwargs)
            self.assertNotIn(PASSWORD,str(error.exception));self.assertNotIn(TOKEN,str(error.exception))

class OrchestrationTests(unittest.TestCase):
    def run_mocked(self,before=None,after=None,error=None,version=None):
        fake=Mock()
        for name in ('CONNECTION','PROJECT','INSTANCE','SECRET','RESOURCE','DATABASE'):
            setattr(fake,name,getattr(r,name))
        fake.cloud.side_effect=[{},version if version is not None else dict(name=r.RESOURCE,state='ENABLED'),TOKEN.encode()]
        fake.read_password.return_value=PASSWORD
        fake.read_catalog.side_effect=[catalog() if before is None else before,catalog(True) if after is None else after]
        fake.proxy_environment.return_value={'CSQL_PROXY_TOKEN':TOKEN}
        proxy=Mock();proxy.poll.return_value=None;works=[]
        def popen(args,**kwargs):
            self.assertEqual(args[:2],['cloud-sql-proxy',r.CONNECTION])
            self.assertNotIn(TOKEN,' '.join(args))
            work=Path(args[2].split('=',1)[1]);works.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode),0o700)
            (work/r.CONNECTION).mkdir();(work/r.CONNECTION/'.s.PGSQL.5432').touch()
            return proxy
        out=io.StringIO()
        try:
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(p,f,fake,SQL025,MIGRATIONS)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_sql',side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_fulfillment()
                        finally:
                            self.calls=execute.call_args_list;self.reader=fake
            return [json.loads(line) for line in out.getvalue().splitlines()]
        finally:
            for work in works:
                self.assertFalse(work.exists());fake.stop_proxy.assert_called_once_with(proxy)
            self.output=out.getvalue()
            self.assertNotIn(PASSWORD,self.output);self.assertNotIn(TOKEN,self.output)

    def test_success_requires_preflight_one_write_and_full_readback(self):
        final=self.run_mocked()[-1]
        self.assertEqual(len(self.calls),3)
        self.assertEqual([call.args[4] for call in self.calls],['PREVIEW_V2_FULFILLMENT_PREDECESSOR_ACK',
            'PREVIEW_V2_FULFILLMENT_COMMIT_ACK','PREVIEW_V2_FULFILLMENT_READBACK_ACK'])
        self.assertEqual(sum('BEGIN READ WRITE;' in call.args[3] for call in self.calls),1)
        self.assertEqual(self.reader.read_catalog.call_count,2)
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(48,4,6))
        self.assertEqual(final['stage'],'PREVIEW_V2_FULFILLMENT_026_028_VERIFIED')
        for flag in ('application_deployed','full_schema_ready','floot_connected','runtime_grants_mutation'):
            self.assertFalse(final[flag])

    def test_partial_or_applied_catalog_never_enters_write(self):
        for value in (catalog(True),{**catalog(),'relation_count':39}):
            with self.assertRaises(SystemExit):self.run_mocked(before=value)
            self.assertEqual(len(self.calls),0)

    def test_failed_detailed_preflight_never_enters_write(self):
        with self.assertRaises(SystemExit):self.run_mocked(error=SystemExit('STOP: PREDECESSOR_DRIFT'))
        self.assertEqual(len(self.calls),1)
        self.assertNotIn('PREFLIGHT_PASSED',self.output)
        self.assertNotIn('COMMIT_ACKNOWLEDGED',self.output)

    def test_failed_write_or_readback_never_reports_success_or_retries(self):
        for sequence in ([None,SystemExit('STOP: WRITE_UNCONFIRMED')],
                         [None,None,SystemExit('STOP: READBACK_UNCONFIRMED')]):
            with self.assertRaises(SystemExit):self.run_mocked(error=sequence)
            self.assertEqual(len(self.calls),len(sequence))
            self.assertNotIn('026_028_VERIFIED',self.output)
            self.assertEqual('COMMIT_ACKNOWLEDGED' in self.output,len(sequence)==3)

    def test_catalog_readback_failure_keeps_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after=catalog())
        self.assertEqual(len(self.calls),2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.output)
        self.assertNotIn('026_028_VERIFIED',self.output)

    def test_disabled_secret_stops_before_payload_and_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
