"""Offline exact-source, atomic 031/032, security contract and failure checks."""
import ast
import base64
import contextlib
import copy
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

m=module('taxi_authority',ROOT/'scripts/apply-preview-v2-taxi-authority.py')
prior=module('admin_tests',ROOT/'tests/test_preview_v2_billing_admin_role.py')
a,b,t,h,p,f,r=prior.m,prior.b,prior.t,prior.h,prior.p,prior.f,prior.r
SQL025,MIGRATIONS,SQL029,SQL030,SQL033=prior.SQL025,prior.MIGRATIONS,prior.SQL029,prior.SQL030,prior.SQL033
SQL031,SQL032=[(ROOT/'backend/migrations/versions'/name).read_text() for name,blob,sha in m.MIGRATIONS]
ARGS=(a,b,t,h,p,f,SQL025,MIGRATIONS,SQL029,SQL030,SQL033,SQL031,SQL032)
PASSWORD='ab'*32
TOKEN='synthetic-m3132-token'


def catalog(applied=False):
    value=prior.catalog()
    if applied:
        value.update(relation_count=62,routine_count=9,schemas=[
            {'name':'khedmah_taxi','owner':'khedmah_migrator'},{'name':'public','owner':'pg_database_owner'}])
        for name in m.TABLES:
            row=dict(value['relations'][0],schema='khedmah_taxi',name=name)
            value['relations'].append(row)
    return value


class SourceTests(unittest.TestCase):
    def source_map(self):
        result=prior.SourceTests().source_map()
        pins=[('scripts/apply-preview-v2-billing-admin-role.py',m.ADMIN_BLOB,m.ADMIN_SHA256)]
        pins += [('backend/migrations/versions/'+name,blob,sha) for name,blob,sha in m.MIGRATIONS]
        for path,blob,sha in pins:
            data=(ROOT/path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),blob)
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha);result[blob]=data
        return result

    def test_sixteen_pinned_sources_load_without_apply(self):
        sources=self.source_map();self.assertEqual(len(sources),16)
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kwargs['capture_output']);self.assertNotIn('GH_DEBUG',kwargs['env'])
            return subprocess.CompletedProcess(args,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):reader,args=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,16);self.assertEqual(args[-2:],(SQL031,SQL032))
        self.assertEqual(reader.PROJECT,r.PROJECT)

    def test_tampered_sql_or_dependency_stops(self):
        for index in (6,8,9,10,11,12):
            args=list(ARGS);args[index]+='\n'
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(args)
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.ADMIN_SHA256)
            importer.assert_not_called()


class SQLTests(unittest.TestCase):
    def test_atomic_canonical_order_and_no_previous_replay(self):
        sql=m.build_sql(ARGS)
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertEqual(sql.count(SQL031),1);self.assertEqual(sql.count(SQL032),1)
        self.assertLess(sql.index('khedmah-nonproduction-taxi-operational-031'),sql.index('khedmah-nonproduction-taxi-operational-032'))
        self.assertLess(sql.index('khedmah-nonproduction-taxi-operational-032'),sql.index('MIGRATION_033_TARGET_CONSTRAINT_INVALID'))
        self.assertLess(sql.index('MIGRATION_033_TARGET_CONSTRAINT_INVALID'),sql.index(SQL031))
        self.assertLess(sql.index(SQL031),sql.index(SQL032))
        self.assertLess(sql.index(SQL032),sql.index('MIGRATIONS_031_032_APPROVAL_TABLES_NOT_EMPTY'))
        self.assertLess(sql.index('MIGRATIONS_031_032_TRIGGER_CONTRACT_FAILED'),sql.index('COMMIT;'))
        for old in (SQL025,*MIGRATIONS,SQL029,SQL030,SQL033):self.assertNotIn(old,sql)
        self.assertNotRegex(SQL031+SQL032,r'\b(?:INSERT INTO|UPDATE khedmah|DELETE FROM|GRANT |CREATE ROLE)')

    def test_only_intended_catalog_scope_changes_predecessor_preserved(self):
        baseline=m.predecessor_contract(ARGS)
        old=p.catalog_guard(b.tables(t,h,p,f),'MIGRATION_030_POSTCONDITION_FAILED',routine_count=7)
        expanded=p.catalog_guard(b.tables(t,h,p,f),'MIGRATIONS_031_032_PUBLIC_POSTCONDITION_FAILED',routine_count=9)
        expanded=expanded.replace("nspname NOT IN ('public','information_schema')", "nspname NOT IN ('public','khedmah_taxi','information_schema')")
        self.assertEqual(m.retained_contract(ARGS),expanded+baseline[len(old):])
        self.assertIn(a.role_contract(True),m.retained_contract(ARGS))
        self.assertNotIn(a.role_contract(False),m.retained_contract(ARGS))
        with patch.object(a,'postcondition_sql',return_value='unexpected'):
            with self.assertRaisesRegex(SystemExit,'MANIFEST'):m.retained_contract(ARGS)

    def test_exact_table_column_fk_and_index_manifest(self):
        columns,keys,fkeys=m.table_manifest(SQL031)
        self.assertEqual((len(columns),len(keys),len(fkeys)),(35,5,10))
        self.assertEqual(sum(row[-1] for row in columns),3)
        self.assertIn(('driver_approvals',3,'khedmah_taxi.vehicle_approvals','id'),fkeys)
        self.assertIn(('operational_approval_events','created_at','timestamp with time zone',12,True,True),columns)
        sql=m.structural_contract(b,SQL031)
        for token in ('COLUMNS','CHECKS','FKEYS','KEYS'):self.assertNotIn(token,sql)
        self.assertIn("c.relkind='r' AND a.attnum>0",sql)
        self.assertIn("i.indkey='2 12'",sql);self.assertIn("i.indoption='0 3'",sql)
        self.assertIn("x.confdeltype='r'",sql);self.assertIn('NOT x.convalidated',sql)

    def test_whole_check_definitions_reject_extra_boolean_logic(self):
        sql=m.structural_contract(b,SQL031)
        normalize=lambda value:re.sub(r'[\s()]|::text','',value)
        for raw in ("CHECK ((status = ANY (ARRAY['approved'::text, 'suspended'::text, 'revoked'::text])))",
                    'CHECK ((reviewed_by <> driver_user_id))',
                    'CHECK (((char_length(btrim(verification_reference)) >= 5) AND (char_length(btrim(verification_reference)) <= 200)))'):
            expected=normalize(raw)
            self.assertIn(expected.replace("'","''"),sql)
            self.assertNotIn(normalize(raw+' OR true').replace("'","''"),sql)

    def test_new_security_definer_uses_exact_032_body_signature_and_acl(self):
        sql=m.routine_contract(SQL031,SQL032)
        self.assertIn(SQL032.split('AS $$',1)[1].split('$$;',1)[0],sql)
        self.assertNotIn(SQL031.rsplit('AS $$',1)[1].split('$$;',1)[0],sql)
        for token in ("p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']",'p.prosecdef',
                      "p.proargtypes='25 16'",'p.proallargtypes=ARRAY[25,16,25,25,25,25,25,1184]',
                      "p.proargmodes=ARRAY['i','i','t','t','t','t','t','t']",'p.prosrc=$resolver$',
                      'NOT p.proleakproof',"pg_catalog.pg_get_userbyid(p.proowner)='khedmah_migrator'",
                      "NOT pg_catalog.has_function_privilege('khedmah_app'",'a.grantee=0'):
            self.assertIn(token,sql)

    def test_schema_acl_and_empty_approval_contract(self):
        sql=m.schema_contract()
        self.assertIn("acldefault('n',n.nspowner)",sql)
        for role in ('khedmah_app','khedmah_runtime_role'):
            self.assertIn("NOT pg_catalog.has_schema_privilege('"+role+"',n.oid,'CREATE')",sql)
        for table in m.TABLES:self.assertIn('EXISTS (SELECT 1 FROM khedmah_taxi.'+table+')',sql)
        self.assertIn('TRUNCATE,REFERENCES,TRIGGER',sql)

    def test_readonly_preflight_rejects_any_existing_taxi_schema_and_readback_uses_hardened_body(self):
        pre,post=m.build_preflight_sql(ARGS),m.build_readback_sql(ARGS)
        self.assertIn("nspname NOT IN ('public','information_schema')",pre)
        self.assertIn('MIGRATION_033_TARGET_CONSTRAINT_INVALID',pre)
        self.assertIn('MIGRATIONS_031_032_ROUTINE_BODY_SECURITY_OWNER_OR_EXECUTE_DRIFT',post)
        for sql in (pre,post):
            self.assertTrue(sql.startswith('BEGIN READ ONLY;'));self.assertIn('ROLLBACK;',sql)
            for token in ('COMMIT;','BEGIN READ WRITE;','CREATE SCHEMA','CREATE TABLE','REVOKE ALL'):
                self.assertNotIn(token,sql)

    def test_catalog_checks_both_schemas_and_blocks_drift(self):
        m.verify_result(ARGS,catalog(True))
        for change in (lambda v:v.update(relation_count=61),lambda v:v.update(routine_count=8),
                       lambda v:v['schemas'][0].update(owner='khedmah_app'),
                       lambda v:v['relations'][-1].update(schema='public'),
                       lambda v:v['relations'][-1].update(runtime_insert=True),
                       lambda v:v['relations'][-1].update(owner='postgres'),
                       lambda v:v['relations'].pop(),lambda v:v.update(read_only='off'),
                       lambda v:v['roles'][0].update(super=True)):
            value=catalog(True);change(value)
            with self.assertRaises(SystemExit):m.verify_result(ARGS,value)
        with self.assertRaises(SystemExit):b.verify_result(t,h,p,f,catalog(True))

    def test_cli_accepts_only_explicit_phase(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/apply-preview-v2-taxi-authority.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_APPLY_TAXI_AUTHORITY_ONLY',result.stderr)


class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(ARGS)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                file=work/'taxi-authority.pgpass'
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
                return result or subprocess.CompletedProcess(args,0,'PREVIEW_V2_TAXI_AUTHORITY_COMMIT_ACK\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}):
                with patch.object(m.subprocess,'run',side_effect=run) as calls:
                    try:m.execute_sql(r,work,PASSWORD,sql,'PREVIEW_V2_TAXI_AUTHORITY_COMMIT_ACK')
                    finally:
                        self.assertEqual(calls.call_count,1)
                        self.assertFalse((work/'taxi-authority.pgpass').exists())

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
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(fake,ARGS)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_sql',side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.apply_taxi_authority()
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
        self.assertEqual([call.args[4] for call in self.calls],['PREVIEW_V2_TAXI_AUTHORITY_PREDECESSOR_ACK',
            'PREVIEW_V2_TAXI_AUTHORITY_COMMIT_ACK','PREVIEW_V2_TAXI_AUTHORITY_READBACK_ACK'])
        self.assertEqual(sum('BEGIN READ WRITE;' in call.args[3] for call in self.calls),1)
        self.assertEqual(self.reader.read_catalog.call_count,2)
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(62,9,12))
        self.assertEqual(final['stage'],'PREVIEW_V2_TAXI_AUTHORITY_031_032_VERIFIED')
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
            self.assertNotIn('031_032_VERIFIED',self.output)
            self.assertEqual('COMMIT_ACKNOWLEDGED' in self.output,len(sequence)==3)

    def test_catalog_readback_failure_keeps_ack_without_success(self):
        with self.assertRaises(SystemExit):self.run_mocked(after={**catalog(),'relation_count':58})
        self.assertEqual(len(self.calls),2)
        self.assertIn('COMMIT_ACKNOWLEDGED',self.output)
        self.assertNotIn('031_032_VERIFIED',self.output)

    def test_disabled_secret_stops_before_payload_and_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
