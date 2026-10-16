"""Offline read-only snapshot, source-pin, privacy and failure checks."""
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

m=module('schema_acl',ROOT/'scripts/read-preview-v2-schema-acl.py')
prior=module('food_tests',ROOT/'tests/test_preview_v2_food_promotions.py')
food,authority,ARGS,SQL034,r=prior.m,prior.authority,prior.ARGS,prior.SQL034,prior.r
PASSWORD='ab'*32
TOKEN='synthetic-read-acl-token'


def inventory():
    return dict(database='khedmah',user='khedmah_migrator',session_user='khedmah_migrator',read_only='on',
        database_owner='postgres',counts=dict(schemas=2,relations=64,sequences=0,routines=9,triggers=12),
        schema_owners=[dict(schema='khedmah_taxi',owner='khedmah_migrator'),dict(schema='public',owner='pg_database_owner')],
        effective_count=0,effective_privileges=[],explicit_count=0,explicit_privileges=[],
        default_count=0,default_privileges=[],membership_count=0,effective_memberships=[],
        runtime_ownership=[dict(role=role,databases=0,schemas=0,relations=0,routines=0,types=0) for role in m.RUNTIME_ROLES],
        role_setting_rows=0,unvalidated_constraints=[
            dict(schema='public',table='business_profiles',constraint='business_profiles_category_code_fk'),
            dict(schema='public',table='service_listings',constraint='service_listings_category_code_fk')])


class SourceTests(unittest.TestCase):
    def test_nineteen_pins_load_without_apply(self):
        sources=prior.SourceTests().source_map()
        data=(ROOT/'scripts/apply-preview-v2-food-promotions.py').read_bytes()
        self.assertEqual(hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),m.FOOD_BLOB)
        self.assertEqual(hashlib.sha256(data).hexdigest(),m.FOOD_SHA256)
        sources[m.FOOD_BLOB]=data;self.assertEqual(len(sources),19)
        def run(args,**kwargs):
            self.assertEqual(args[:4],['gh','api','--hostname','github.com'])
            blob=args[-1].split('/')[-1];data=sources[blob]
            self.assertNotIn('GH_DEBUG',kwargs['env']);self.assertTrue(kwargs['capture_output'])
            return subprocess.CompletedProcess(args,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):loaded=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,19);self.assertEqual(loaded[-1],SQL034)
        self.assertEqual(loaded[0].PROJECT,r.PROJECT)

    def test_tampering_stops_before_import_or_query(self):
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(food,authority,ARGS,SQL034+'\n')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.verified_module(Path(directory),'bad',b'bad',m.FOOD_SHA256)
            importer.assert_not_called()


class ReadOnlyTests(unittest.TestCase):
    def test_repeatable_read_snapshot_retains_all_034_postconditions(self):
        sql=m.build_sql(food,authority,ARGS,SQL034)
        self.assertTrue(sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;'))
        self.assertEqual(sql.count('ROLLBACK;'),1);self.assertTrue(sql.endswith('ROLLBACK;\n'))
        self.assertIn(food.postcondition_sql(authority,ARGS,SQL034),sql)
        for forbidden in ('BEGIN READ WRITE;','COMMIT;','LOCK TABLE','CREATE TABLE food_promo_codes','ALTER DEFAULT PRIVILEGES'):
            self.assertNotIn(forbidden,sql)
        tree=ast.parse((ROOT/'scripts/read-preview-v2-schema-acl.py').read_text())
        calls=[n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)]
        self.assertFalse(any(name.startswith('apply_') for name in calls))
        self.assertNotIn('execute_sql',calls)

    def test_catalog_queries_cover_columns_inheritance_public_defaults_and_ownership(self):
        for token in ('has_column_privilege(s.name::name','has_table_privilege(s.name::name',
                      'has_function_privilege(s.name::name','has_sequence_privilege(s.name::name',
                      "('public')",'WITH GRANT OPTION','aclexplode(a.attacl)','pg_default_acl',
                      "pg_has_role(r.oid,g.oid,'USAGE')","pg_has_role(r.oid,g.oid,'MEMBER')",
                      'runtime_ownership','unvalidated_constraints','LIMIT 300'):
            self.assertIn(token,m.INVENTORY_SQL)
        self.assertNotIn('setconfig',m.INVENTORY_SQL)
        self.assertNotIn('rolpassword',m.INVENTORY_SQL)
        for app_query in ('FROM public.','FROM khedmah_taxi.'):
            self.assertNotIn(app_query,m.INVENTORY_SQL)

    def test_complete_inventory_accepted_without_assuming_privileges_are_ready(self):
        value=inventory();self.assertEqual(m.validate_inventory(value),value)
        value['effective_privileges']=[dict(subject='khedmah_app',kind='column',object='public.profiles.name',privilege='REFERENCES',grantable=False)]
        value['effective_count']=1
        self.assertEqual(m.validate_inventory(value),value)

    def test_wrong_target_writeable_or_changed_object_counts_rejected(self):
        for change in (lambda v:v.update(database='wrong'),lambda v:v.update(user='postgres'),
                       lambda v:v.update(session_user='postgres'),lambda v:v.update(read_only='off'),
                       lambda v:v['counts'].update(relations=63),lambda v:v['counts'].update(sequences=False),
                       lambda v:v['schema_owners'][0].update(owner='khedmah_app')):
            value=inventory();change(value)
            with self.assertRaises(SystemExit):m.validate_inventory(value)

    def test_truncated_or_unexpected_metadata_never_printed(self):
        for change in (lambda v:v.update(effective_count=301),lambda v:v.update(explicit_count=1),
                       lambda v:v.update(default_privileges=[{'payload':PASSWORD}]),
                       lambda v:v.update(role_setting_rows=-1),lambda v:v.update(unexpected=TOKEN),
                       lambda v:v['runtime_ownership'][0].update(roles='bad')):
            value=inventory();change(value)
            with self.assertRaises(SystemExit) as error:m.validate_inventory(value)
            self.assertNotIn(PASSWORD,str(error.exception));self.assertNotIn(TOKEN,str(error.exception))

    def test_cli_accepts_inspect_only(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/read-preview-v2-schema-acl.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_INSPECT_ONLY',result.stderr)


class ExecutionTests(unittest.TestCase):
    def invoke(self,result=None,error=None):
        sql=m.build_sql(food,authority,ARGS,SQL034)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                path=work/'schema-acl.pgpass'
                self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
                self.assertIn(str(work/r.CONNECTION).replace(':','\\:'),path.read_text())
                self.assertEqual(args[args.index('-U')+1],r.USER)
                self.assertEqual(args[args.index('-d')+1],r.DATABASE)
                self.assertNotIn(PASSWORD,' '.join(args));self.assertNotIn('PGPASSWORD',kwargs['env'])
                self.assertNotIn('PGSERVICE',kwargs['env']);self.assertTrue(kwargs['capture_output'])
                self.assertIn('default_transaction_read_only=on',kwargs['env']['PGOPTIONS'])
                self.assertEqual(kwargs['input'],sql)
                if error:raise error
                return result or subprocess.CompletedProcess(args,0,json.dumps(inventory()),'')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}),patch.object(m.subprocess,'run',side_effect=run) as calls:
                try:return m.execute_read(r,work,PASSWORD,sql)
                finally:
                    self.assertEqual(calls.call_count,1);self.assertFalse((work/'schema-acl.pgpass').exists())

    def test_private_credentials_and_cleanup(self):self.assertEqual(self.invoke(),inventory())

    def test_read_failure_timeout_invalid_and_oversize_output_redacted_without_retry(self):
        for kwargs in (dict(error=subprocess.TimeoutExpired(TOKEN,300)),
                       dict(result=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)),
                       dict(result=subprocess.CompletedProcess([],0,'not-json',TOKEN)),
                       dict(result=subprocess.CompletedProcess([],0,'x'*262145,TOKEN))):
            with self.assertRaises(SystemExit) as error:self.invoke(**kwargs)
            self.assertNotIn(PASSWORD,str(error.exception));self.assertNotIn(TOKEN,str(error.exception))


class OrchestrationTests(unittest.TestCase):
    def run_mocked(self,before=None,metadata=None,error=None,version=None):
        fake=Mock()
        for name in ('CONNECTION','PROJECT','INSTANCE','SECRET','RESOURCE','DATABASE'):
            setattr(fake,name,getattr(r,name))
        fake.cloud.side_effect=[{},version if version is not None else dict(name=r.RESOURCE,state='ENABLED'),TOKEN.encode()]
        fake.read_password.return_value=PASSWORD
        fake.read_catalog.return_value=prior.catalog(True) if before is None else before
        fake.proxy_environment.return_value={'CSQL_PROXY_TOKEN':TOKEN}
        proxy=Mock();proxy.poll.return_value=None;works=[]
        def popen(args,**kwargs):
            self.assertEqual(args[:2],['cloud-sql-proxy',r.CONNECTION]);self.assertNotIn(TOKEN,' '.join(args))
            work=Path(args[2].split('=',1)[1]);works.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode),0o700)
            (work/r.CONNECTION).mkdir();(work/r.CONNECTION/'.s.PGSQL.5432').touch();return proxy
        out=io.StringIO()
        try:
            with patch.object(m.shutil,'which',return_value='/fake'),patch.object(m,'load_sources',return_value=(fake,food,authority,ARGS,SQL034)):
                with patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.stat,'S_ISSOCK',return_value=True):
                    with patch.object(m,'execute_read',return_value=inventory() if metadata is None else metadata,side_effect=error) as execute,contextlib.redirect_stdout(out):
                        try:m.inspect_schema_acl()
                        finally:self.calls=execute.call_args_list;self.reader=fake
            return [json.loads(line) for line in out.getvalue().splitlines()]
        finally:
            for work in works:self.assertFalse(work.exists());fake.stop_proxy.assert_called_once_with(proxy)
            self.output=out.getvalue();self.assertNotIn(PASSWORD,self.output);self.assertNotIn(TOKEN,self.output)

    def test_success_has_one_read_and_no_mutation_or_readiness_claim(self):
        final=self.run_mocked()[-1]
        self.assertEqual(len(self.calls),1);self.assertEqual(self.reader.read_catalog.call_count,1)
        self.assertTrue(self.calls[0].args[3].startswith('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;'))
        self.assertEqual(final['stage'],'PREVIEW_V2_SCHEMA_ACL_READ_COMPLETED_NO_MUTATION')
        self.assertEqual((final['table_count'],final['routine_count'],final['trigger_count']),(64,9,12))
        for flag in ('schema_mutation','runtime_grants_mutation','cloud_resource_configuration_mutation','full_schema_ready',
                     'application_deployed','floot_connected','grant_changes_prepared','runtime_credential_access','runtime_login_tested'):
            self.assertFalse(final[flag])

    def test_observed_column_access_is_reported_not_declared_absent(self):
        value=inventory();value['effective_privileges']=[dict(subject='khedmah_app',kind='column',object='public.profiles.name',privilege='REFERENCES',grantable=False)];value['effective_count']=1
        final=self.run_mocked(metadata=value)[-1]
        self.assertFalse(final['runtime_object_grants_absent_observed']);self.assertFalse(final['grant_changes_prepared'])

    def test_predecessor_drift_stops_before_detail_read(self):
        with self.assertRaises(SystemExit):self.run_mocked(before={**prior.catalog(True),'relation_count':63})
        self.assertEqual(len(self.calls),0);self.assertEqual(self.output,'')

    def test_failed_read_never_reports_success_or_retries(self):
        with self.assertRaises(SystemExit):self.run_mocked(error=SystemExit('STOP: READ_FAILED'))
        self.assertEqual(len(self.calls),1);self.assertEqual(self.output,'')

    def test_disabled_secret_stops_before_payload_or_proxy(self):
        with self.assertRaises(SystemExit):self.run_mocked(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertEqual(len(self.calls),0);self.reader.read_password.assert_not_called()

if __name__=='__main__':unittest.main()
