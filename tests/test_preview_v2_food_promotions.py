"""Offline guarded 034 envelope, predecessor, schema and failure tests."""
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

m=module('food_promotions',ROOT/'scripts/apply-preview-v2-food-promotions.py')
prior=module('authority_tests',ROOT/'tests/test_preview_v2_taxi_authority.py')
authority,ARGS,r=prior.m,prior.ARGS,prior.r
b,t,h,p,f=prior.b,prior.t,prior.h,prior.p,prior.f
SQL034=(ROOT/'backend/migrations/versions/034_food_order_promotions.sql').read_text()
PASSWORD='ab'*32
TOKEN='synthetic-m34-token'


def catalog(applied=False):
    value=prior.catalog(True)
    if applied:
        value['relation_count']=64
        for name in m.TABLES:
            value['relations'].append(dict(value['relations'][0],schema='public',name=name))
    return value


class SourceTests(unittest.TestCase):
    def source_map(self):
        result=prior.SourceTests().source_map()
        for path,blob,sha in [('scripts/apply-preview-v2-taxi-authority.py',m.AUTHORITY_BLOB,m.AUTHORITY_SHA256),
                             ('backend/migrations/versions/'+m.MIGRATION_NAME,m.MIGRATION_BLOB,m.MIGRATION_SHA256)]:
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha);result[blob]=data
        return result

    def test_eighteen_pins_load_without_apply(self):
        sources=self.source_map();self.assertEqual(len(sources),18)
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kwargs['capture_output']);self.assertNotIn('GH_DEBUG',kwargs['env'])
            return subprocess.CompletedProcess(args,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):loaded=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,18);self.assertEqual(loaded[-1],SQL034)
        self.assertEqual(loaded[0].PROJECT,r.PROJECT)

    def test_tampered_sources_stop_before_execution(self):
        for sql in (SQL034+'\n',SQL034.replace('subtotal - discount_amount','subtotal + discount_amount')):
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(authority,ARGS,sql)
        args=list(ARGS);args[-1]+='\n'
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(authority,args,SQL034)
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.AUTHORITY_SHA256)
            importer.assert_not_called()


class SQLTests(unittest.TestCase):
    def test_canonical_ddl_unchanged_inside_one_owned_transaction(self):
        sql=m.build_sql(authority,ARGS,SQL034);body=m.canonical_body(SQL034)
        self.assertEqual(body,SQL034.split('BEGIN;\n\n',1)[1].removesuffix('\nCOMMIT;\n'))
        self.assertEqual(sql.count(body),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertNotIn('BEGIN;',sql)
        self.assertLess(sql.index('khedmah-nonproduction-food-promotions-034'),sql.index('LOCK TABLE public.fulfillment_orders'))
        self.assertLess(sql.index('LOCK TABLE public.fulfillment_orders'),sql.index('MIGRATION_034_EXISTING_ORDERS_REQUIRE_REVIEW'))
        self.assertLess(sql.index('MIGRATION_034_EXISTING_ORDERS_REQUIRE_REVIEW'),sql.index(body))
        self.assertLess(sql.index(body),sql.index('MIGRATION_034_COLUMN_CONTRACT_FAILED'))
        self.assertLess(sql.index('MIGRATION_034_ACCESS_CONTRACT_FAILED'),sql.index('COMMIT;'))
        for old in (prior.SQL025,*prior.MIGRATIONS,prior.SQL029,prior.SQL030,prior.SQL033,prior.SQL031,prior.SQL032):
            self.assertNotIn(old,sql)
        self.assertNotRegex(body,r'\b(?:INSERT INTO|UPDATE fulfillment|DELETE FROM|GRANT |CREATE ROLE)')

    def test_retains_every_previous_contract_except_expanded_table_list(self):
        old=p.catalog_guard(b.tables(t,h,p,f),'MIGRATIONS_031_032_PUBLIC_POSTCONDITION_FAILED',routine_count=9)
        new=p.catalog_guard(sorted(b.tables(t,h,p,f)+m.TABLES),'MIGRATION_034_PUBLIC_POSTCONDITION_FAILED',routine_count=9)
        def expand(sql):return sql.replace("nspname NOT IN ('public','information_schema')", "nspname NOT IN ('public','khedmah_taxi','information_schema')")
        baseline=authority.postcondition_sql(ARGS)
        self.assertEqual(m.retained_contract(authority,ARGS),expand(new)+baseline[len(expand(old)):])
        for part in (authority.schema_contract(),authority.routine_contract(prior.SQL031,prior.SQL032),prior.a.role_contract(True)):
            self.assertIn(part,m.retained_contract(authority,ARGS))
        with patch.object(authority,'postcondition_sql',return_value='unexpected'):
            with self.assertRaisesRegex(SystemExit,'MANIFEST'):m.retained_contract(authority,ARGS)

    def test_manifest_31_new_columns_three_order_columns_seven_fks_four_indexes(self):
        columns,foreign,indexes=m.table_manifest(SQL034)
        self.assertEqual((len(columns),len(foreign),len(indexes)),(34,7,4))
        self.assertIn(('fulfillment_orders','discount_amount','numeric(14,2)',30,True,'0'),columns)
        self.assertIn(('food_promo_codes','percentage_off','smallint',7,False,''),columns)
        self.assertIn(('food_promo_codes','created_at','timestamp with time zone',17,True,'now'),columns)
        self.assertIn(('fulfillment_orders',28,'food_promo_codes','id'),foreign)
        self.assertIn(('food_promo_merchant_created_idx','food_promo_codes','4 17','0 3'),indexes)
        self.assertEqual(sum(row[-1]!='' for row in columns),8)
        sql=m.structural_contract(b,SQL034)
        for placeholder in ('COLUMN_VALUES','FOREIGN_VALUES','KEY_VALUES','CHECK_VALUES','INDEX_VALUES','DEFAULT_DEFINITION','CHECK_DEFINITION'):
            self.assertNotIn(placeholder,sql)

    def test_empty_orders_and_partial_state_guard_before_changes(self):
        sql=m.build_preflight_sql(authority,ARGS,SQL034)
        for name in ('food_promo_id','promo_code','discount_amount','food_promo_active_window_idx'):
            self.assertIn(name,sql)
        self.assertIn('IF EXISTS (SELECT 1 FROM public.fulfillment_orders)',sql)
        self.assertIn('MIGRATION_034_PARTIAL_STATE_NO_REPLAY',sql)
        self.assertIn(m.total_contract(False),sql)

    def test_old_and_new_total_rules_are_distinct_and_whole(self):
        old='CHECK (((delivery_fee IS NULL) AND (total IS NULL)) OR (total = (subtotal + delivery_fee)))'
        new=old.replace('subtotal + delivery_fee','(subtotal - discount_amount) + delivery_fee')
        normalize=lambda value:re.sub(r'[\s()]|::text|::numeric','',value).replace("'0'",'0')
        for applied,definition in ((False,old),(True,new)):
            expected=re.search(r'\$expected\$(.*?)\$expected\$',m.total_contract(applied),re.S).group(1)
            self.assertEqual(normalize(definition),expected)
            self.assertNotEqual(normalize(definition+' OR true'),expected)
        self.assertNotEqual(m.total_contract(False),m.total_contract(True))

    def test_full_check_contracts_include_discount_shape_and_claim_lifecycle(self):
        checks=m.checks_manifest();self.assertEqual(len(checks),21)
        self.assertEqual(sum(t=='food_promo_codes' for t,d in checks),13)
        self.assertEqual(sum(t=='food_promo_claims' for t,d in checks),6)
        self.assertIn(('fulfillment_orders','CHECKdiscount_amount>=0ANDdiscount_amount<subtotal'),checks)
        self.assertTrue(any('fixed_amount<minimum_subtotalANDmaximum_discountISNULL' in d for t,d in checks))
        self.assertTrue(any("status='released'ANDredeemed_atISNULLANDreleased_atISNOTNULL" in d for t,d in checks))
        sql=m.structural_contract(b,SQL034)
        self.assertIn('NOT c.convalidated',sql);self.assertIn("c.confdeltype='r'",sql)
        self.assertIn('MIGRATION_034_ORDERS_OR_PROMOTIONS_NOT_EMPTY',sql)
        self.assertIn('TRUNCATE,REFERENCES,TRIGGER',sql)

    def test_readonly_phases_never_mutate(self):
        for sql in (m.build_preflight_sql(authority,ARGS,SQL034),m.build_readback_sql(authority,ARGS,SQL034)):
            self.assertTrue(sql.startswith('BEGIN READ ONLY;'));self.assertIn('ROLLBACK;',sql)
            for token in ('COMMIT;','BEGIN READ WRITE;','CREATE TABLE','ALTER TABLE fulfillment_orders','LOCK TABLE'):
                self.assertNotIn(token,sql)

    def test_catalog_drift_rejected_for_new_and_retained_objects(self):
        m.verify_result(authority,ARGS,catalog(True))
        for change in (lambda v:v.update(relation_count=63),lambda v:v.update(routine_count=8),
                       lambda v:v['relations'][-1].update(schema='khedmah_taxi'),
                       lambda v:v['relations'][-1].update(runtime_insert=True),
                       lambda v:v['relations'][0].update(owner='postgres'),
                       lambda v:v['relations'].pop(),lambda v:v.update(read_only='off'),
                       lambda v:v['roles'][0].update(super=True)):
            value=catalog(True);change(value)
            with self.assertRaises(SystemExit):m.verify_result(authority,ARGS,value)
        with self.assertRaises(SystemExit):authority.verify_result(ARGS,catalog(True))

    def test_only_explicit_034_cli_is_allowed(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/apply-preview-v2-food-promotions.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_APPLY_FOOD_PROMOTIONS_ONLY',result.stderr)


class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(authority,ARGS,SQL034)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                file=work/'food-promotions.pgpass'
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
                return result or subprocess.CompletedProcess(args,0,'PREVIEW_V2_FOOD_PROMOTIONS_COMMIT_ACK\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}):
                with patch.object(m.subprocess,'run',side_effect=run) as calls:
                    try:m.execute_sql(r,work,PASSWORD,sql,'PREVIEW_V2_FOOD_PROMOTIONS_COMMIT_ACK')
                    finally:
                        self.assertEqual(calls.call_count,1)
                        self.assertFalse((work/'food-promotions.pgpass').exists())

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
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(fake,authority,ARGS,SQL034)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_sql',side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_food_promotions()
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
        self.assertEqual([call.args[4] for call in self.calls],['PREVIEW_V2_FOOD_PROMOTIONS_PREDECESSOR_ACK',
            'PREVIEW_V2_FOOD_PROMOTIONS_COMMIT_ACK','PREVIEW_V2_FOOD_PROMOTIONS_READBACK_ACK'])
        self.assertEqual(sum('BEGIN READ WRITE;' in call.args[3] for call in self.calls),1)
        self.assertEqual(self.reader.read_catalog.call_count,2)
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(64,9,12))
        self.assertEqual(final['stage'],'PREVIEW_V2_FOOD_PROMOTIONS_034_VERIFIED')
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
            self.assertNotIn('034_VERIFIED',self.output)
            self.assertEqual('COMMIT_ACKNOWLEDGED' in self.output,len(sequence)==3)

    def test_catalog_readback_failure_keeps_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after={**catalog(),'relation_count':58})
        self.assertEqual(len(self.calls),2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.output)
        self.assertNotIn('034_VERIFIED',self.output)

    def test_disabled_secret_stops_before_payload_and_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
