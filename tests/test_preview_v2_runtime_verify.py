"""Read-only reconciliation, actual-login boundary and credential privacy tests."""
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
from unittest.mock import Mock,patch

ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
m=module('runtime_verify',ROOT/'scripts/verify-preview-v2-runtime.py')
prior=module('grant_tests',ROOT/'tests/test_preview_v2_runtime_grants.py')
grants,acl,food,authority,args,sql034,r=prior.m,prior.acl,prior.food,prior.authority,prior.args,prior.sql034,prior.r
PASSWORD='ab'*32
TOKEN='synthetic-runtime-read-token'


def receipt(runtime=False,state='EXPECTED_GRANTS_PRESENT'):
    user='khedmah_app' if runtime else r.USER
    value=dict(database='khedmah',user=user,session_user=user,read_only='on',table_count=64,routine_count=9,trigger_count=12)
    if runtime:value.update(acl_exact=True,allowed_select_probes=62,denied_select_probes=2)
    else:value.update(acl_state=state)
    return value


class SourceTests(unittest.TestCase):
    def test_twenty_one_pinned_dependencies_load_without_mutation(self):
        sources=prior.prior.prior.SourceTests().source_map()
        for path,blob,sha in [('scripts/apply-preview-v2-food-promotions.py',acl.FOOD_BLOB,acl.FOOD_SHA256),
                             ('scripts/read-preview-v2-schema-acl.py',grants.ACL_BLOB,grants.ACL_SHA256),
                             ('scripts/grant-preview-v2-runtime.py',m.GRANT_BLOB,m.GRANT_SHA256)]:
            data=(ROOT/path).read_bytes();self.assertEqual(hashlib.sha256(data).hexdigest(),sha);sources[blob]=data
        def run(command,**kw):
            blob=command[-1].split('/')[-1];data=sources[blob]
            self.assertTrue(kw['capture_output']);self.assertNotIn('GH_DEBUG',kw['env'])
            return subprocess.CompletedProcess(command,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            loaded=m.load_sources(Path(directory))
        self.assertEqual(calls.call_count,21);self.assertEqual(loaded[-1],sql034)
        source=ast.parse((ROOT/'scripts/verify-preview-v2-runtime.py').read_text())
        calls=[node.func.attr for node in ast.walk(source) if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute)]
        self.assertFalse(any(name.startswith('apply_') for name in calls));self.assertNotIn('grant_sql',calls)

    def test_tampered_helper_never_imported(self):
        raw=json.dumps(dict(sha=m.GRANT_BLOB,encoding='base64',size=3,content=base64.b64encode(b'bad').decode())).encode()
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],0,raw,b'')),\
             patch.object(m.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.load_sources(Path(directory))
            importer.assert_not_called()


class SQLTests(unittest.TestCase):
    def test_readonly_rollback_both_modes_and_no_dml_or_migration(self):
        for sql in (m.state_sql(grants,acl),m.runtime_sql(grants,acl)):
            self.assertTrue(sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;'))
            self.assertTrue(sql.endswith('ROLLBACK;\n'))
            for text in ('BEGIN READ WRITE','COMMIT;','GRANT SELECT','INSERT INTO','UPDATE public.',
                         'DELETE FROM','CREATE TABLE','ALTER ROLE','ALTER DEFAULT','EXPLAIN ANALYZE'):
                self.assertNotIn(text,sql)

    def test_state_classifies_exact_before_or_after_and_rejects_drift(self):
        sql=m.state_sql(grants,acl)
        for text in ('GRANTS_NOT_APPLIED','EXPECTED_GRANTS_PRESENT','RUNTIME_ACL_DRIFT_REVIEW_REQUIRED',
                     grants.inventory_query(acl),grants.expected_query()):self.assertIn(text,sql)
        self.assertNotIn('LIMIT 300',sql)

    def test_runtime_compares_same_acls_and_has_62_no_row_probes_two_denials(self):
        sql=m.runtime_sql(grants,acl)
        self.assertEqual(sql.count(' WHERE false;'),64)
        self.assertEqual(sql.count('EXCEPTION WHEN insufficient_privilege THEN NULL;'),2)
        self.assertIn("session_user<>'khedmah_app'",sql)
        self.assertIn("jsonb_build_object('user','khedmah_app','session_user','khedmah_app')",sql)
        self.assertIn('RUNTIME_LOGIN_ACL_MISMATCH',sql)
        self.assertNotIn('SET ROLE',sql)

    def test_catalog_is_checked_without_overwriting_observed_privileges(self):
        catalog=prior.prior.prior.catalog(True)
        catalog['relations'][0]['runtime_select']=True
        before=copy.deepcopy(catalog);m.verify_structure(grants,r,args,catalog);self.assertEqual(catalog,before)
        for change in (lambda v:v['relations'][0].update(owner='khedmah_app'),
                       lambda v:v['roles'][0].update(super=True),lambda v:v.update(relation_count=63),
                       lambda v:v['relations'][0].update(name='unexpected')):
            bad=copy.deepcopy(catalog);change(bad)
            with self.assertRaises(SystemExit):m.verify_structure(grants,r,args,bad)


class SecretTests(unittest.TestCase):
    def read(self,value=None,raw=None):
        resource='projects/'+r.NUMBER+'/secrets/DATABASE_URL/versions/1'
        value=value or dict(name=resource,payload=dict(data=base64.b64encode(
            ('postgresql://khedmah_app:'+PASSWORD+'@localhost/khedmah').encode()).decode()))
        opener=Mock();opener.open.return_value=io.BytesIO(raw if raw is not None else json.dumps(value).encode())
        with patch.object(m.urllib.request,'build_opener',return_value=opener) as factory:
            result=m.read_runtime_password(r,TOKEN)
        factory.assert_called_once_with(r.NoRedirect)
        request=opener.open.call_args.args[0]
        self.assertEqual(request.full_url,'https://secretmanager.googleapis.com/v1/'+resource+':access')
        self.assertEqual(request.get_method(),'GET');return result

    def test_reads_exact_runtime_secret_without_redirect(self):self.assertEqual(self.read(),PASSWORD)

    def test_wrong_resource_role_target_and_oversize_fail_redacted(self):
        resource='projects/'+r.NUMBER+'/secrets/DATABASE_URL/versions/1'
        for target in ('postgresql://khedmah_migrator:'+PASSWORD+'@localhost/khedmah',
                       'postgresql://khedmah_app:'+PASSWORD+'@other/khedmah',
                       'postgresql://khedmah_app:'+PASSWORD+'@localhost/production'):
            with self.assertRaises(SystemExit) as e:self.read(dict(name=resource,payload=dict(data=base64.b64encode(target.encode()).decode())))
            self.assertNotIn(PASSWORD,str(e.exception))
        with self.assertRaises(SystemExit):self.read(dict(name='projects/wrong',payload={}))
        with self.assertRaises(SystemExit):self.read(raw=b'x'*16385)


class ExecutionTests(unittest.TestCase):
    def invoke(self,runtime=False,response=None,error=None):
        user=m.RUNTIME_USER if runtime else r.USER
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(command,**kw):
                path=work/'runtime-verify.pgpass'
                self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
                self.assertIn(':khedmah:'+user+':',path.read_text())
                self.assertEqual(command[command.index('-U')+1],user)
                self.assertNotIn(PASSWORD,' '.join(command));self.assertNotIn('PGPASSWORD',kw['env'])
                self.assertIn('default_transaction_read_only=on',kw['env']['PGOPTIONS']);self.assertTrue(kw['capture_output'])
                if error:raise error
                return response or subprocess.CompletedProcess(command,0,json.dumps(receipt(runtime)),'')
            with patch.object(m.subprocess,'run',side_effect=run) as calls:
                try:return m.execute_read(r,work,user,PASSWORD,'sql',runtime=runtime)
                finally:self.assertEqual(calls.call_count,1);self.assertFalse((work/'runtime-verify.pgpass').exists())

    def test_real_user_selection_and_private_cleanup(self):
        self.assertEqual(self.invoke(),receipt());self.assertEqual(self.invoke(True),receipt(True))

    def test_errors_timeouts_unexpected_output_are_redacted_no_retry(self):
        for kw in (dict(error=subprocess.TimeoutExpired(TOKEN,300)),
                   dict(response=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)),
                   dict(response=subprocess.CompletedProcess([],0,'x'*4097,TOKEN)),
                   dict(response=subprocess.CompletedProcess([],0,json.dumps(dict(receipt(),extra=PASSWORD)),''))):
            with self.assertRaises(SystemExit) as e:self.invoke(**kw)
            self.assertNotIn(PASSWORD,str(e.exception));self.assertNotIn(TOKEN,str(e.exception))


class OrchestrationTests(unittest.TestCase):
    def invoke(self,verify=False,state='EXPECTED_GRANTS_PRESENT',version=True,execute_error=None):
        fake=Mock()
        for name in ('CONNECTION','PROJECT','NUMBER','INSTANCE','SECRET','RESOURCE','DATABASE','USER'):
            setattr(fake,name,getattr(r,name))
        fake.cloud.side_effect=[{},dict(name=r.RESOURCE,state='ENABLED'),TOKEN.encode(),
            dict(name='projects/'+r.NUMBER+'/secrets/DATABASE_URL/versions/1',state='ENABLED' if version else 'DISABLED')]
        fake.read_password.return_value=PASSWORD;fake.read_catalog.return_value=prior.prior.prior.catalog(True)
        fake.proxy_environment.return_value={'CSQL_PROXY_TOKEN':TOKEN}
        proxy=Mock();proxy.poll.return_value=None
        def popen(command,**kw):
            work=Path(command[-1].split('=',1)[1]);sock=work/r.CONNECTION/'.s.PGSQL.5432';sock.parent.mkdir();sock.touch();return proxy
        values=[receipt(state=state),receipt(True),receipt(state=state)]
        out=io.StringIO()
        with patch.object(m,'load_sources',return_value=(grants,acl,fake,food,authority,args,sql034)),\
             patch.object(m.shutil,'which',return_value='/test'),patch.object(m.subprocess,'Popen',side_effect=popen),\
             patch.object(m.stat,'S_ISSOCK',return_value=True),patch.object(m,'read_runtime_password',return_value=PASSWORD) as secret,\
             patch.object(m,'execute_read',side_effect=execute_error or values) as execute,contextlib.redirect_stdout(out):
            error=None
            try:m.inspect_runtime(verify)
            except SystemExit as e:error=str(e)
        return error,out.getvalue(),fake,secret.call_count,execute.call_count

    def test_inspect_never_reads_runtime_secret_or_claims_login(self):
        for state in ('GRANTS_NOT_APPLIED','EXPECTED_GRANTS_PRESENT'):
            error,out,fake,secrets,calls=self.invoke(state=state)
            self.assertIsNone(error);self.assertEqual((secrets,calls),(0,1));value=json.loads(out)
            self.assertEqual(value['acl_state'],state);self.assertFalse(value['runtime_login_verified']);self.assertFalse(value['runtime_grants_mutation'])
            fake.stop_proxy.assert_called_once()

    def test_pending_grants_stop_verify_before_runtime_secret_read(self):
        error,out,fake,secrets,calls=self.invoke(True,state='GRANTS_NOT_APPLIED')
        self.assertIn('NO_RUNTIME_SECRET_READ',error);self.assertEqual((secrets,calls),(0,1));self.assertEqual(out,'')

    def test_disabled_runtime_version_blocks_secret_access(self):
        error,out,fake,secrets,calls=self.invoke(True,version=False)
        self.assertIn('VERSION_ONE',error);self.assertEqual((secrets,calls),(0,1))

    def test_verified_login_stays_read_only_without_deployment_claim(self):
        error,out,fake,secrets,calls=self.invoke(True)
        self.assertIsNone(error);self.assertEqual((secrets,calls),(1,3));value=json.loads(out)
        self.assertTrue(value['runtime_login_verified']);self.assertEqual(value['runtime_allowed_select_probes'],62)
        for key in ('runtime_dml_tested','schema_mutation','runtime_grants_mutation','application_data_rows_read',
                    'cloud_resource_configuration_mutation','full_schema_ready','full_schema_contract_reverified',
                    'application_deployed','floot_connected','retry_authorized','prior_attempt_commit_or_rollback_proven'):
            self.assertIs(value[key],False)
        fake.stop_proxy.assert_called_once();self.assertNotIn(PASSWORD,out);self.assertNotIn(TOKEN,out)

    def test_runtime_failure_does_not_print_success_or_retry(self):
        error,out,fake,secrets,calls=self.invoke(True,execute_error=[receipt(),SystemExit('STOP: LOGIN_FAILED')])
        self.assertIn('LOGIN_FAILED',error);self.assertEqual(calls,2);self.assertEqual(out,'');fake.stop_proxy.assert_called_once()


if __name__=='__main__':
    import sys
    if sys.argv[1:]==['--sql-lab-pack']:
        print(json.dumps(dict(state=m.state_sql(grants,acl),runtime=m.runtime_sql(grants,acl))))
    else:unittest.main()
