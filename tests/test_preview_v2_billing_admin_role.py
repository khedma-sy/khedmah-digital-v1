"""Offline 033 constraint-only transaction, predecessor and no-replay checks."""
import ast
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

m=module('billing_admin',ROOT/'scripts/apply-preview-v2-billing-admin-role.py')
prior=module('billing_tests',ROOT/'tests/test_preview_v2_billing.py')
b,t,h,p,f,r=prior.m,prior.t,prior.h,prior.p,prior.f,prior.r
SQL025,MIGRATIONS,SQL029,SQL030=prior.SQL025,prior.MIGRATIONS,prior.SQL029,prior.SQL030
SQL033=(ROOT/'backend/migrations/versions/033_billing_admin_role.sql').read_text()
ARGS=(b,t,h,p,f,SQL025,MIGRATIONS,SQL029,SQL030,SQL033)
PASSWORD='ab'*32
TOKEN='synthetic-m33-token'

def catalog(applied=False):
    # 033 changes a constraint only, so catalog counts alone cannot establish its state.
    return prior.catalog(True)


class SourceTests(unittest.TestCase):
    def source_map(self):
        result=prior.SourceTests().source_map()
        for path,blob,sha in [('scripts/apply-preview-v2-billing.py',m.BILLING_BLOB,m.BILLING_SHA256),
                             ('backend/migrations/versions/'+m.MIGRATION_NAME,m.MIGRATION_BLOB,m.MIGRATION_SHA256)]:
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha);result[blob]=data
        return result

    def test_thirteen_pinned_sources_load_without_apply(self):
        sources=self.source_map();self.assertEqual(len(sources),13)
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kwargs['capture_output']);self.assertNotIn('GH_DEBUG',kwargs['env'])
            return subprocess.CompletedProcess(args,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):loaded=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,13);self.assertEqual(loaded[-1],SQL033)
        self.assertEqual(loaded[5].PROJECT,r.PROJECT)

    def test_tampered_migration_or_dependency_stops_before_execution(self):
        for sql in (SQL033+'\n',SQL033.replace('billing_admin','other_admin'),SQL033+'COMMIT;\n'):
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(*ARGS[:-1],sql)
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
            m.build_sql(b,t,h,p,f,SQL025,MIGRATIONS,SQL029,SQL030+'\n',SQL033)
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.BILLING_SHA256)
            importer.assert_not_called()


class SQLTests(unittest.TestCase):
    def test_exact_canonical_lock_and_alters_wrapped_in_one_transaction(self):
        lock,alter=m.canonical_statements(SQL033);sql=m.build_sql(*ARGS)
        self.assertEqual(lock+'\n\n'+alter,SQL033.split('BEGIN;\n\n',1)[1].removesuffix('\nCOMMIT;\n'))
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertNotIn('BEGIN;',sql);self.assertEqual(sql.count(lock),1);self.assertEqual(sql.count(alter),1)
        self.assertLess(sql.index('khedmah-nonproduction-billing-033'),sql.index(lock))
        self.assertLess(sql.index(lock),sql.index('MIGRATION_033_PREDECESSOR_INVALID_NO_REPLAY'))
        self.assertLess(sql.index('MIGRATION_033_PREDECESSOR_INVALID_NO_REPLAY'),sql.index(alter))
        self.assertLess(sql.index(alter),sql.index('MIGRATION_033_TARGET_CONSTRAINT_INVALID'))
        self.assertLess(sql.index('MIGRATION_033_ROLE_ROW_COUNT_CHANGED'),sql.index('COMMIT;'))
        for earlier in [SQL025,*MIGRATIONS,SQL029,SQL030]:self.assertNotIn(earlier,sql)
        for token in ('INSERT','UPDATE','DELETE','TRUNCATE','CREATE ROLE','GRANT'):
            self.assertNotRegex(lock+alter,r'\b'+token+r'\b')

    def test_retains_all_billing_contracts_except_intentionally_changed_constraint(self):
        baseline=b.postcondition_sql(t,h,p,f,SQL025,MIGRATIONS,SQL029,SQL030)
        retained=m.retained_contract(*ARGS[:-1])
        self.assertEqual(retained+b.admin_role_predecessor_contract(),baseline)
        self.assertEqual(m.postcondition_sql(*ARGS),retained+m.role_contract(True))
        with patch.object(b,'postcondition_sql',return_value='unexpected'):
            with self.assertRaisesRegex(SystemExit,'MANIFEST'):m.retained_contract(*ARGS[:-1])

    def test_predecessor_and_target_predicates_are_distinct_and_reject_extra_logic(self):
        old="CHECK ((role = ANY (ARRAY['bootstrap_admin'::text, 'platform_admin'::text, 'moderator'::text])))"
        new=old.replace("'moderator'::text","'moderator'::text, 'billing_admin'::text")
        normalized=lambda value:re.sub(r'[\s()]|::text','',value)
        expected=lambda applied:re.search(r'\$expected\$(.*?)\$expected\$',m.role_contract(applied),re.S).group(1)
        self.assertEqual(normalized(old),expected(False));self.assertEqual(normalized(new),expected(True))
        self.assertNotEqual(expected(False),expected(True))
        for bad in (new+' OR true',new.replace('role =','role <>'),new.replace('billing_admin','super_admin'),
                    new.replace("'billing_admin'::text","'billing_admin'::text, 'extra_admin'::text")):
            self.assertNotEqual(normalized(bad),expected(True))
        for applied in (False,True):
            sql=m.role_contract(applied)
            for token in ('c.convalidated','NOT c.condeferrable','cardinality(c.conkey)=1',"a.attname='role'"):
                self.assertIn(token,sql)

    def test_read_only_preflight_and_readback_never_mutate(self):
        pre=m.build_preflight_sql(*ARGS);post=m.build_readback_sql(*ARGS)
        self.assertIn(m.role_contract(False),pre);self.assertNotIn(m.role_contract(True),pre)
        self.assertIn(m.role_contract(True),post);self.assertNotIn(m.role_contract(False),post)
        for sql in (pre,post):
            self.assertTrue(sql.startswith('BEGIN READ ONLY;'));self.assertIn('ROLLBACK;',sql)
            for token in ('COMMIT;','BEGIN READ WRITE;','LOCK TABLE','ALTER TABLE public.admin_roles','set_config('):
                self.assertNotIn(token,sql)

    def test_catalog_drift_blocks_without_using_counts_to_claim_033(self):
        b.verify_result(t,h,p,f,catalog())
        for mutate in (lambda v:v.update(relation_count=58),lambda v:v.update(routine_count=8),
                       lambda v:v['relations'][0].update(owner='postgres'),lambda v:v['relations'][0].update(runtime_insert=True),
                       lambda v:v['roles'][0].update(super=True),lambda v:v['memberships'][0].update(admin=True)):
            value=catalog();mutate(value)
            with self.assertRaises(SystemExit):b.verify_result(t,h,p,f,value)

    def test_cli_accepts_only_explicit_033_step(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/apply-preview-v2-billing-admin-role.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_APPLY_BILLING_ADMIN_ROLE_ONLY',result.stderr)


class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(*ARGS)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                file=work/'billing-admin.pgpass'
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
                return result or subprocess.CompletedProcess(args,0,'PREVIEW_V2_BILLING_ADMIN_COMMIT_ACK\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}):
                with patch.object(m.subprocess,'run',side_effect=run) as calls:
                    try:m.execute_sql(r,work,PASSWORD,sql,'PREVIEW_V2_BILLING_ADMIN_COMMIT_ACK')
                    finally:
                        self.assertEqual(calls.call_count,1)
                        self.assertFalse((work/'billing-admin.pgpass').exists())

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
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(b,t,h,p,f,fake,SQL025,MIGRATIONS,SQL029,SQL030,SQL033)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_sql',side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_billing_admin_role()
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
        self.assertEqual([call.args[4] for call in self.calls],['PREVIEW_V2_BILLING_ADMIN_PREDECESSOR_ACK',
            'PREVIEW_V2_BILLING_ADMIN_COMMIT_ACK','PREVIEW_V2_BILLING_ADMIN_READBACK_ACK'])
        self.assertEqual(sum('BEGIN READ WRITE;' in call.args[3] for call in self.calls),1)
        self.assertEqual(self.reader.read_catalog.call_count,2)
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(59,7,11))
        self.assertEqual(final['stage'],'PREVIEW_V2_BILLING_ADMIN_033_VERIFIED')
        for flag in ('application_deployed','full_schema_ready','floot_connected','runtime_grants_mutation'):
            self.assertFalse(final[flag])

    def test_drifted_catalog_never_enters_write(self):
        for value in ({**catalog(),'relation_count':58},{**catalog(),'routine_count':6}):
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
            self.assertNotIn('033_VERIFIED',self.output)
            self.assertEqual('COMMIT_ACKNOWLEDGED' in self.output,len(sequence)==3)

    def test_catalog_readback_failure_keeps_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after={**catalog(),'relation_count':58})
        self.assertEqual(len(self.calls),2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.output)
        self.assertNotIn('033_VERIFIED',self.output)

    def test_disabled_secret_stops_before_payload_and_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
