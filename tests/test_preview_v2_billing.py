"""Offline Preview 030 source, transaction, secret handling and no-replay checks."""
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

m=module('billing',ROOT/'scripts/apply-preview-v2-billing.py')
prior=module('taxi_tests',ROOT/'tests/test_preview_v2_taxi_pricing.py')
t,h,p,f,r=prior.m,prior.h,prior.p,prior.f,prior.r
SQL025,MIGRATIONS,SQL029=prior.SQL025,prior.MIGRATIONS,prior.SQL029
SQL030=(ROOT/'backend/migrations/versions/030_billing_credits_subscriptions.sql').read_text()
ARGS=(t,h,p,f,SQL025,MIGRATIONS,SQL029,SQL030)
PASSWORD='ab'*32
TOKEN='synthetic-m30-token'

def catalog(applied=False):
    value=prior.catalog(True)
    if applied:
        for name in m.BILLING_TABLES:
            value['relations'].append(dict(name=name,schema='public',kind='r',owner='khedmah_migrator',
                runtime_select=False,runtime_insert=False,runtime_update=False,runtime_delete=False))
        value['relation_count']=59;value['routine_count']=7
    return value


class SQLTests(unittest.TestCase):
    def test_one_transaction_contains_only_canonical_030_and_full_precommit_checks(self):
        sql=m.build_sql(*ARGS)
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertEqual(sql.count(SQL030),1)
        for previous in [SQL025,*MIGRATIONS,SQL029]:self.assertNotIn(previous,sql)
        self.assertLess(sql.index('khedmah-nonproduction-billing-030'),sql.index('MIGRATION_029_POSTCONDITION_FAILED'))
        self.assertLess(sql.index('MIGRATION_030_PRESENT_OR_PARTIAL_NO_REPLAY'),sql.index(SQL030))
        self.assertLess(sql.index(SQL030),sql.index('MIGRATION_030_POSTCONDITION_FAILED'))
        self.assertLess(sql.index('MIGRATION_030_SEED_OR_EMPTY_TRANSACTION_TABLE_CONTRACT_FAILED'),sql.index('COMMIT;'))
        for token in ('GRANT ','ALTER ROLE ','CREATE ROLE ','DROP TABLE ','ALTER TABLE public.admin_roles','\\ir'):
            self.assertNotIn(token,sql)

    def test_read_only_preflight_and_readback_use_complete_contracts(self):
        pre=m.build_preflight_sql(*ARGS);post=m.build_readback_sql(*ARGS)
        self.assertIn(t.postcondition_sql(h,p,f,SQL025,MIGRATIONS,SQL029),pre)
        self.assertIn(m.postcondition_sql(*ARGS),post)
        for sql in (pre,post):
            self.assertTrue(sql.startswith('BEGIN READ ONLY;'));self.assertIn('ROLLBACK;',sql)
            for token in ('COMMIT;','BEGIN READ WRITE;','CREATE TABLE','LOCK TABLE'):self.assertNotIn(token,sql)

    def test_seven_canonical_function_bodies_and_eleven_trigger_bindings(self):
        sql=m.routine_trigger_contract(p,SQL025,MIGRATIONS[1],SQL029,SQL030)
        bodies=re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;',SQL030,re.S)
        self.assertEqual(len(bodies),2)
        for name,body in bodies:self.assertIn('$body$'+body+'$body$',sql)
        for binding in [('billing_credit_ledger_no_rewrite','billing_credit_ledger','reject_billing_ledger_mutation',27),
                        ('billing_usage_receipts_no_rewrite','billing_usage_receipts','reject_billing_ledger_mutation',27),
                        ('billing_promo_redemptions_no_rewrite','billing_promo_redemptions','reject_billing_ledger_mutation',27),
                        ('billing_welcome_after_session','identity_sessions','grant_welcome_credit_on_login',5)]:
            self.assertIn("('%s','%s','%s',%d)"%binding,sql)
        self.assertIn('<> 7 THEN',sql);self.assertEqual(sql.count('<> 11'),2)
        for token in ('NOT p.prosecdef','p.prosrc=e.body',"t.tgenabled='O'",'acl.grantee=0',"'khedmah_runtime_role'"):
            self.assertIn(token,sql)

    def test_canonical_schema_manifest_retains_optional_columns_partial_indexes_and_constraints(self):
        cols,cons,indexes=m.schema_manifest(SQL030)
        self.assertEqual((len(cols),len(cons),len(indexes)),(87,10,7))
        self.assertEqual([x[1] for x in cols if x[0]=='billing_purchase_orders' and not x[4]],
                         ['promo_code','external_reference','paid_at'])
        self.assertEqual([x[5] for x in indexes if x[5]],
                         ["status='pending'","status='active'",'points_remaining>0'])
        self.assertEqual(sum(x[2] for x in indexes),1)
        self.assertEqual([sum(x[i] for x in cons) for i in range(1,5)],[39,10,6,14])
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.schema_manifest(SQL030+'\n')

    def test_seed_comparison_checks_values_not_just_counts_and_keeps_033_separate(self):
        sql=m.seed_contract(SQL030)
        self.assertEqual(len(re.findall(r'\bEXCEPT\b',sql)),6)
        for value in ('starter_monthly','business_annual','features::jsonb','KHEDMA30','2026-12-31 23:59:59+03',
                      'percentage_off=30','per_user_limit=1',"('default','SYP','SYP_NEW_2026',100,30)"):
            self.assertIn(value,sql)
        for table in ('billing_purchase_orders','billing_subscriptions','billing_credit_grants','billing_credit_ledger',
                      'billing_usage_receipts','billing_promo_redemptions'):
            self.assertIn('EXISTS (SELECT 1 FROM public.'+table+')',sql)
        self.assertIn("NOT LIKE '%billing_admin%'",m.admin_role_predecessor_contract())
        self.assertIn(m.admin_role_predecessor_contract(),m.build_preflight_sql(*ARGS))
        self.assertIn(m.admin_role_predecessor_contract(),m.build_readback_sql(*ARGS))

    def test_old_not_valid_fks_stay_outside_billing_scope(self):
        sql=m.postcondition_sql(*ARGS)
        self.assertIn(h.structural_contract(),sql);self.assertIn(t.structural_contract(),sql)
        self.assertNotIn('VALIDATE CONSTRAINT',sql)
        self.assertIn('c.relname IN (',m.structural_contract(SQL030))
        self.assertNotIn('business_profiles',m.structural_contract(SQL030))

    def test_cli_accepts_only_explicit_billing_step(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/apply-preview-v2-billing.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_APPLY_BILLING_ONLY',result.stderr)


class SourceTests(unittest.TestCase):
    def source_map(self):
        result=prior.SourceTests().source_map()
        for path,blob,sha in [('scripts/apply-preview-v2-taxi-pricing.py',m.TAXI_BLOB,m.TAXI_SHA256),
                             ('backend/migrations/versions/'+m.MIGRATION_NAME,m.MIGRATION_BLOB,m.MIGRATION_SHA256)]:
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha)
            result[blob]=data
        return result

    def test_eleven_pinned_sources_load_without_apply(self):
        sources=self.source_map()
        self.assertEqual(len(sources),11)
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kwargs['capture_output']);self.assertNotIn('GH_DEBUG',kwargs['env'])
            return subprocess.CompletedProcess(args,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):
                loaded=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,11)
        self.assertEqual(loaded[-1],SQL030);self.assertEqual(loaded[4].PROJECT,r.PROJECT)

    def test_tampered_canonical_or_predecessor_source_stops(self):
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(*ARGS[:-1],SQL030+'\n')
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(t,h,p,f,SQL025+'\n',MIGRATIONS,SQL029,SQL030)
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(t,h,p,f,SQL025,MIGRATIONS[::-1],SQL029,SQL030)
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.TAXI_SHA256)
            importer.assert_not_called()

class CatalogTests(unittest.TestCase):
    def test_complete_49_predecessor_and_59_result_are_distinct(self):
        t.verify_result(h,p,f,catalog())
        m.verify_result(t,h,p,f,catalog(True))
        with self.assertRaises(SystemExit):t.verify_result(h,p,f,catalog(True))
        with self.assertRaises(SystemExit):m.verify_result(t,h,p,f,catalog())

    def test_owner_grant_role_identity_and_incomplete_catalog_drift_rejected(self):
        for mutate in (lambda v:v['relations'].pop(),lambda v:v['relations'][0].update(owner='postgres'),
                       lambda v:v['relations'][0].update(runtime_insert=True),lambda v:v.update(routine_count=4),
                       lambda v:v['roles'][0].update(super=True),lambda v:v['memberships'][0].update(admin=True),
                       lambda v:v['database_privileges'][0].update(create=True),lambda v:v.update(schemas=[]),
                       lambda v:v.update(database='wrong'),lambda v:v.update(read_only='off'),
                       lambda v:v.update(relation_inventory_complete=False)):
            value=catalog(True);mutate(value)
            with self.assertRaises(SystemExit):m.verify_result(t,h,p,f,value)

class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(*ARGS)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                file=work/'billing.pgpass'
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
                return result or subprocess.CompletedProcess(args,0,'PREVIEW_V2_BILLING_COMMIT_ACK\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}):
                with patch.object(m.subprocess,'run',side_effect=run) as calls:
                    try:m.execute_sql(r,work,PASSWORD,sql,'PREVIEW_V2_BILLING_COMMIT_ACK')
                    finally:
                        self.assertEqual(calls.call_count,1)
                        self.assertFalse((work/'billing.pgpass').exists())

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
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(t,h,p,f,fake,SQL025,MIGRATIONS,SQL029,SQL030)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_sql',side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_billing()
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
        self.assertEqual([call.args[4] for call in self.calls],['PREVIEW_V2_BILLING_PREDECESSOR_ACK',
            'PREVIEW_V2_BILLING_COMMIT_ACK','PREVIEW_V2_BILLING_READBACK_ACK'])
        self.assertEqual(sum('BEGIN READ WRITE;' in call.args[3] for call in self.calls),1)
        self.assertEqual(self.reader.read_catalog.call_count,2)
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(59,7,11))
        self.assertEqual(final['stage'],'PREVIEW_V2_BILLING_030_VERIFIED')
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
            self.assertNotIn('030_VERIFIED',self.output)
            self.assertEqual('COMMIT_ACKNOWLEDGED' in self.output,len(sequence)==3)

    def test_catalog_readback_failure_keeps_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after=catalog())
        self.assertEqual(len(self.calls),2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.output)
        self.assertNotIn('030_VERIFIED',self.output)

    def test_disabled_secret_stops_before_payload_and_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
