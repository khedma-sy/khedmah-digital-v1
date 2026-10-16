"""Offline 029 transaction, predecessor, secrecy and no-replay tests."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value

m=module('taxi_pricing',ROOT/'scripts/apply-preview-v2-taxi-pricing.py')
prior=module('fulfillment_tests',ROOT/'tests/test_preview_v2_fulfillment.py')
h,p,f,r=prior.m,prior.p,prior.f,prior.r
SQL025,MIGRATIONS=prior.SQL025,prior.MIGRATIONS
SQL029=(ROOT/'backend/migrations/versions/029_taxi_pricing_revisions.sql').read_text()
ARGS=(h,p,f,SQL025,MIGRATIONS,SQL029)
PASSWORD='ab'*32
TOKEN='synthetic-m29-token'

def catalog(applied=False):
    value=prior.catalog(True)
    if applied:
        value['relations'].append(dict(name='taxi_pricing_revisions',schema='public',kind='r',owner='khedmah_migrator',
            runtime_select=False,runtime_insert=False,runtime_update=False,runtime_delete=False))
        value['relation_count']=49;value['routine_count']=5
    return value


class SourceTests(unittest.TestCase):
    def source_map(self):
        result=prior.SourceTests().source_map()
        for path,blob,sha in [('scripts/apply-preview-v2-fulfillment.py',m.FULFILLMENT_BLOB,m.FULFILLMENT_SHA256),
                             ('backend/migrations/versions/'+m.MIGRATION_NAME,m.MIGRATION_BLOB,m.MIGRATION_SHA256)]:
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha)
            result[blob]=data
        return result

    def test_nine_pinned_sources_load_without_apply(self):
        sources=self.source_map()
        self.assertEqual(len(sources),9)
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kwargs['capture_output']);self.assertNotIn('GH_DEBUG',kwargs['env'])
            return subprocess.CompletedProcess(args,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):
                loaded=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,9)
        self.assertEqual(loaded[-1],SQL029);self.assertEqual(loaded[3].PROJECT,r.PROJECT)

    def test_tampered_canonical_or_predecessor_source_stops(self):
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(*ARGS[:-1],SQL029+'\n')
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(h,p,f,SQL025+'\n',MIGRATIONS,SQL029)
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(h,p,f,SQL025,MIGRATIONS[::-1],SQL029)
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.FULFILLMENT_SHA256)
            importer.assert_not_called()


class CatalogTests(unittest.TestCase):
    def test_complete_48_predecessor_and_49_result_are_distinct(self):
        h.verify_result(p,f,catalog())
        m.verify_result(h,p,f,catalog(True))
        with self.assertRaises(SystemExit):h.verify_result(p,f,catalog(True))
        with self.assertRaises(SystemExit):m.verify_result(h,p,f,catalog())

    def test_owner_grant_role_identity_and_incomplete_catalog_drift_rejected(self):
        for mutate in (lambda v:v['relations'].pop(),lambda v:v['relations'][0].update(owner='postgres'),
                       lambda v:v['relations'][0].update(runtime_insert=True),lambda v:v.update(routine_count=4),
                       lambda v:v['roles'][0].update(super=True),lambda v:v['memberships'][0].update(admin=True),
                       lambda v:v['database_privileges'][0].update(create=True),lambda v:v.update(schemas=[]),
                       lambda v:v.update(database='wrong'),lambda v:v.update(read_only='off'),
                       lambda v:v.update(relation_inventory_complete=False)):
            value=catalog(True);mutate(value)
            with self.assertRaises(SystemExit):m.verify_result(h,p,f,value)


class SQLTests(unittest.TestCase):
    def test_one_canonical_migration_full_predecessor_and_precommit_contract(self):
        sql=m.build_sql(*ARGS)
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertEqual(sql.count(SQL029),1)
        for previous in [SQL025,*MIGRATIONS]:self.assertNotIn(previous,sql)
        self.assertLess(sql.index('khedmah-nonproduction-taxi-pricing-029'),sql.index('MIGRATIONS_026_028_POSTCONDITION_FAILED'))
        self.assertLess(sql.index('MIGRATION_029_PRESENT_OR_PARTIAL_NO_REPLAY'),sql.index(SQL029))
        self.assertLess(sql.index(SQL029),sql.index('MIGRATION_029_POSTCONDITION_FAILED'))
        self.assertLess(sql.index('MIGRATION_029_INDEX_CONTRACT_FAILED'),sql.index('COMMIT;'))
        for token in ('GRANT ','ALTER ROLE ','CREATE ROLE ','DROP TABLE ', '\\ir'):
            self.assertNotIn(token,sql)
        # Prior routine bodies contain DML only as quoted catalog-comparison data.
        for token in ('INSERT INTO','UPDATE public.','DELETE FROM'):
            self.assertNotIn(token,SQL029)

    def test_read_only_sessions_use_same_contracts(self):
        pre=m.build_preflight_sql(*ARGS);post=m.build_readback_sql(*ARGS)
        self.assertIn(h.postcondition_sql(p,f,SQL025,MIGRATIONS),pre)
        self.assertIn(m.postcondition_sql(*ARGS),post)
        for sql in (pre,post):
            self.assertTrue(sql.startswith('BEGIN READ ONLY;'));self.assertIn('ROLLBACK;',sql)
            for token in ('COMMIT;','BEGIN READ WRITE;','CREATE TABLE','LOCK TABLE'):self.assertNotIn(token,sql)

    def test_exact_canonical_five_function_bodies_and_seven_trigger_bindings(self):
        sql=m.routine_trigger_contract(p,SQL025,MIGRATIONS[1],SQL029)
        body=re.search(r'AS \$\$(.*?)\$\$;',SQL029,re.S).group(1)
        self.assertIn(body,sql)
        self.assertIn("('taxi_pricing_revisions_append_only','taxi_pricing_revisions','reject_taxi_pricing_revision_mutation',27)",sql)
        for name in [*p.FUNCTIONS,'create_pending_mobility_document_review','reject_taxi_pricing_revision_mutation']:
            self.assertIn(name,sql)
        self.assertIn('<> 5 THEN',sql);self.assertEqual(sql.count('<> 7'),2)
        for token in ('NOT p.prosecdef','p.prosrc=e.body',"t.tgenabled='O'",'acl.grantee=0',"'khedmah_runtime_role'"):
            self.assertIn(token,sql)

    def test_legacy_unvalidated_fks_remain_outside_new_scope(self):
        sql=m.postcondition_sql(*ARGS)
        self.assertIn(h.structural_contract(),sql)
        self.assertIn("conrelid='public.taxi_pricing_revisions'::regclass\n                  AND (NOT convalidated",sql)
        self.assertNotIn('VALIDATE CONSTRAINT',sql)
        self.assertEqual(SQL029.count('CHECK ('),16)
        self.assertIn('ARRAY[19,16,1,1,1]',sql)

    def test_runtime_cli_has_only_exact_apply_flag(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/apply-preview-v2-taxi-pricing.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_APPLY_TAXI_PRICING_ONLY',result.stderr)


class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(*ARGS)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                file=work/'taxi-pricing.pgpass'
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
                return result or subprocess.CompletedProcess(args,0,'PREVIEW_V2_TAXI_PRICING_COMMIT_ACK\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}):
                with patch.object(m.subprocess,'run',side_effect=run) as calls:
                    try:m.execute_sql(r,work,PASSWORD,sql,'PREVIEW_V2_TAXI_PRICING_COMMIT_ACK')
                    finally:
                        self.assertEqual(calls.call_count,1)
                        self.assertFalse((work/'taxi-pricing.pgpass').exists())

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
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(h,p,f,fake,SQL025,MIGRATIONS,SQL029)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_sql',side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_taxi_pricing()
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
        self.assertEqual([call.args[4] for call in self.calls],['PREVIEW_V2_TAXI_PRICING_PREDECESSOR_ACK',
            'PREVIEW_V2_TAXI_PRICING_COMMIT_ACK','PREVIEW_V2_TAXI_PRICING_READBACK_ACK'])
        self.assertEqual(sum('BEGIN READ WRITE;' in call.args[3] for call in self.calls),1)
        self.assertEqual(self.reader.read_catalog.call_count,2)
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(49,5,7))
        self.assertEqual(final['stage'],'PREVIEW_V2_TAXI_PRICING_029_VERIFIED')
        for flag in ('application_deployed','full_schema_ready','floot_connected','runtime_grants_mutation'):
            self.assertFalse(final[flag])

    def test_partial_or_applied_catalog_never_enters_write(self):
        for value in (catalog(True),{**catalog(),'relation_count':47}):
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
            self.assertNotIn('029_VERIFIED',self.output)
            self.assertEqual('COMMIT_ACKNOWLEDGED' in self.output,len(sequence)==3)

    def test_catalog_readback_failure_keeps_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after=catalog())
        self.assertEqual(len(self.calls),2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.output)
        self.assertNotIn('029_VERIFIED',self.output)

    def test_disabled_secret_stops_before_payload_and_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
