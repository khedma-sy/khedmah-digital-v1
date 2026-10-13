"""Pinned-source, bounded ACL, atomicity, privacy and failure tests."""
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
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
m=module('runtime_grants',ROOT/'scripts/grant-preview-v2-runtime.py')
prior=module('acl_tests',ROOT/'tests/test_preview_v2_schema_acl.py')
acl,food,authority,args,sql034,r=prior.m,prior.food,prior.authority,prior.ARGS,prior.SQL034,prior.r
PASSWORD='ab'*32
TOKEN='synthetic-grants-token'
DIGEST='12'*32


class SourceTests(unittest.TestCase):
    def test_twenty_immutable_sources_load_without_apply(self):
        sources=prior.prior.SourceTests().source_map()
        for path,blob,sha in [('scripts/apply-preview-v2-food-promotions.py',acl.FOOD_BLOB,acl.FOOD_SHA256),
                             ('scripts/read-preview-v2-schema-acl.py',m.ACL_BLOB,m.ACL_SHA256)]:
            data=(ROOT/path).read_bytes();self.assertEqual(hashlib.sha256(data).hexdigest(),sha);sources[blob]=data
        def run(command,**kwargs):
            blob=command[-1].split('/')[-1];data=sources[blob]
            self.assertNotIn('GH_DEBUG',kwargs['env']);self.assertTrue(kwargs['capture_output'])
            return subprocess.CompletedProcess(command,0,json.dumps(dict(sha=blob,size=len(data),encoding='base64',
                content=base64.b64encode(data).decode())).encode(),b'')
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run',side_effect=run) as calls:
            with patch.dict(os.environ,{'GH_DEBUG':'api'}):loaded=m.load_sources(Path(directory))
        self.assertEqual(len(sources),20);self.assertEqual(calls.call_count,20)
        self.assertEqual(loaded[-1],sql034);self.assertEqual(loaded[1].PROJECT,r.PROJECT)

    def test_tampering_rejected_before_query(self):
        with self.assertRaisesRegex(SystemExit,'CHECKSUM'):m.build_sql(acl,food,authority,args,sql034+'\n')
        with patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps(
                dict(sha=m.ACL_BLOB,encoding='base64',size=3,content=base64.b64encode(b'bad').decode())).encode(),b'')):
            with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(SystemExit,'CHECKSUM'):
                m.load_sources(Path(directory))


class SQLTests(unittest.TestCase):
    def test_exact_baseline_and_fail_closed_on_drift(self):
        m.validate_baseline(acl,m.baseline())
        for change in (lambda v:v.update(database_owner='postgres'),lambda v:v.update(role_setting_rows=1),
                       lambda v:v['effective_privileges'][0].update(grantable=True),
                       lambda v:v['default_privileges'][0].update(grantee='public'),
                       lambda v:v['runtime_ownership'][0].update(relations=1)):
            value=copy.deepcopy(m.baseline());change(value)
            with self.assertRaises(SystemExit):m.validate_baseline(acl,value)

    def test_explicit_manifest_excludes_metadata_and_future_objects(self):
        m.validate_manifest(food,authority,args)
        grants=m.grant_sql()
        self.assertEqual(grants.count('GRANT '),7)
        self.assertNotIn('category_taxonomy_022_before_image',grants)
        for forbidden in ('ALL TABLES','ALL ROUTINES','ALL SEQUENCES','DEFAULT PRIVILEGES','PUBLIC;',
                          'WITH GRANT OPTION','CREATE','REVOKE','TRUNCATE','REFERENCES','TRIGGER','TO khedmah_app'):
            self.assertNotIn(forbidden,grants)
        self.assertEqual(len(m.PUBLIC_TABLES),60)
        self.assertEqual((len(m.DRIVER_COLUMNS),len(m.VEHICLE_COLUMNS)),(11,9))
        with patch.object(m,'PUBLIC_TABLES',m.PUBLIC_TABLES+('unreviewed',)):
            with self.assertRaises(SystemExit):m.validate_manifest(food,authority,args)

    def test_single_transaction_validates_before_grant_and_before_commit(self):
        sql=m.build_sql(acl,food,authority,args,sql034)
        contract=food.postcondition_sql(authority,args,sql034)
        self.assertEqual(sql.count('BEGIN READ WRITE;'),1);self.assertEqual(sql.count('COMMIT;'),1)
        self.assertLess(sql.index('LOCK TABLE'),sql.index(contract))
        self.assertLess(sql.index(contract),sql.index('RUNTIME_GRANTS_BASELINE_DRIFT_NO_APPLY'))
        self.assertLess(sql.index('RUNTIME_GRANTS_BASELINE_DRIFT_NO_APPLY'),sql.index(m.grant_sql()))
        self.assertLess(sql.index(m.grant_sql()),sql.index('RUNTIME_GRANTS_EXACT_ACL_MISMATCH'))
        self.assertLess(sql.index('RUNTIME_GRANTS_SCHEMA_CHANGED'),sql.index('COMMIT;'))
        self.assertLess(sql.index('COMMIT;'),sql.index(m.COMMIT_ACK))
        for forbidden in ('CREATE TABLE','INSERT INTO','ALTER ROLE','ALTER DEFAULT PRIVILEGES','DROP TABLE'):
            # Retained verification compares quoted canonical function bodies;
            # those literals contain DML but are never executed by the helper.
            self.assertNotIn(forbidden,sql.replace(contract,''))

    def test_exact_acl_verification_covers_inherited_column_public_and_defaults(self):
        actual=m.inventory_query(acl);expected=m.expected_query()
        self.assertNotIn('LIMIT 300',actual)
        for token in ('has_column_privilege','WITH GRANT OPTION',"('public')",'pg_default_acl',
                      'effective_memberships','runtime_ownership','role_setting_rows'):
            self.assertIn(token,actual)
        for token in ('table_acl','new_acl','explicit_expected','effective_expected',
                      'pg_get_function_identity_arguments',"a.attnum>0 AND NOT a.attisdropped"):
            self.assertIn(token,expected)
        self.assertIn('observed IS DISTINCT FROM expected',m.acl_assertion(acl))

    def test_schema_digest_covers_owner_function_body_triggers_constraints_and_roles(self):
        for token in ('pg_constraint','pg_attribute','pg_attrdef','pg_proc','pg_trigger','pg_index',
                      'pg_namespace','pg_type','pg_policy','pg_roles','pg_auth_members','sha256'):
            self.assertIn(token,m.SCHEMA_QUERY)
        self.assertNotIn('rolpassword',m.SCHEMA_QUERY)
        self.assertNotIn('setconfig',m.SCHEMA_QUERY)
        self.assertIn("to_jsonb(p)-'proacl'",m.SCHEMA_QUERY)

    def test_post_commit_readback_is_read_only_and_checks_same_digest(self):
        sql=m.build_readback_sql(acl,DIGEST)
        self.assertTrue(sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;'))
        self.assertIn(DIGEST,sql);self.assertIn('ROLLBACK;',sql);self.assertNotIn('COMMIT;',sql)
        self.assertIn(m.acl_assertion(acl),sql)
        self.assertNotIn(m.grant_sql(),sql)
        with self.assertRaises(SystemExit):m.build_readback_sql(acl,"'injected")

    def test_cli_requires_explicit_operation(self):
        result=subprocess.run(['python3',str(ROOT/'scripts/grant-preview-v2-runtime.py'),'--apply'],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('USE_APPLY_RUNTIME_GRANTS_ONLY',result.stderr)


class ExecutionTests(unittest.TestCase):
    def run_sql(self,result=None,error=None,readback=False):
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(command,**kwargs):
                path=work/'runtime-grants.pgpass'
                self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
                self.assertIn(PASSWORD,path.read_text());self.assertNotIn(PASSWORD,' '.join(command))
                self.assertNotIn('PGPASSWORD',kwargs['env']);self.assertNotIn('PGSERVICE',kwargs['env'])
                self.assertIn('default_transaction_read_only=on',kwargs['env']['PGOPTIONS'])
                self.assertEqual(command[command.index('-U')+1],'khedmah_migrator')
                self.assertTrue(kwargs['capture_output'])
                if error:raise error
                receipt=json.dumps(dict(schema_digest=DIGEST,table_count=64,routine_count=9,trigger_count=12,acl_exact=True))
                return result or subprocess.CompletedProcess(command,0,receipt+'\n'+m.COMMIT_ACK+'\n','')
            with patch.dict(os.environ,{'PGPASSWORD':PASSWORD,'PGSERVICE':'wrong'}),patch.object(m.subprocess,'run',side_effect=run) as calls:
                try:return m.execute_sql(r,work,PASSWORD,'test sql',readback=readback)
                finally:
                    self.assertFalse((work/'runtime-grants.pgpass').exists());self.assertEqual(calls.call_count,1)

    def test_private_connection_and_valid_commit_ack(self):self.assertEqual(self.run_sql(),DIGEST)

    def test_timeout_missing_ack_error_and_oversize_never_retry_or_expose_payload(self):
        for kwargs in (dict(error=subprocess.TimeoutExpired(TOKEN,600)),
                       dict(result=subprocess.CompletedProcess([],1,PASSWORD,TOKEN)),
                       dict(result=subprocess.CompletedProcess([],0,'{}\n','')),
                       dict(result=subprocess.CompletedProcess([],0,'{}\n'+m.COMMIT_ACK+'\n','')),
                       dict(result=subprocess.CompletedProcess([],0,'x'*4097,TOKEN))):
            with self.assertRaises(SystemExit) as e:self.run_sql(**kwargs)
            self.assertNotIn(PASSWORD,str(e.exception));self.assertNotIn(TOKEN,str(e.exception))

    def test_readback_requires_exact_marker(self):
        self.assertIsNone(self.run_sql(result=subprocess.CompletedProcess([],0,'PREVIEW_V2_RUNTIME_GRANTS_READBACK_ACK\n',''),readback=True))
        with self.assertRaises(SystemExit):self.run_sql(result=subprocess.CompletedProcess([],0,m.COMMIT_ACK,''),readback=True)


class OrchestrationTests(unittest.TestCase):
    def invoke(self,inventory=None,execute_error=None,version=None):
        fake=Mock()
        for name in ('CONNECTION','PROJECT','INSTANCE','SECRET','RESOURCE','DATABASE'):
            setattr(fake,name,getattr(r,name))
        fake.cloud.side_effect=[{},version if version is not None else dict(name=r.RESOURCE,state='ENABLED'),TOKEN.encode()]
        fake.read_password.return_value=PASSWORD;fake.read_catalog.return_value=prior.prior.catalog(True)
        fake.proxy_environment.return_value={'CSQL_PROXY_TOKEN':TOKEN}
        proxy=Mock();proxy.poll.return_value=None
        def popen(command,**kwargs):
            work=Path(command[-1].split('=',1)[1]);sock=work/r.CONNECTION/'.s.PGSQL.5432'
            sock.parent.mkdir();sock.touch();return proxy
        out=io.StringIO()
        with patch.object(m,'load_sources',return_value=(acl,fake,food,authority,args,sql034)),\
             patch.object(m.shutil,'which',return_value='/test'),patch.object(m.subprocess,'Popen',side_effect=popen),\
             patch.object(m.stat,'S_ISSOCK',return_value=True),\
             patch.object(acl,'execute_read',return_value=m.baseline() if inventory is None else inventory),\
             patch.object(m,'execute_sql',side_effect=execute_error or [DIGEST,None]) as execute,contextlib.redirect_stdout(out):
            try:m.apply_runtime_grants()
            except SystemExit as e:return str(e),out.getvalue(),fake,execute.call_count
        return None,out.getvalue(),fake,execute.call_count

    def test_success_reports_acl_only_and_no_runtime_login_or_deployment(self):
        error,output,reader,calls=self.invoke();self.assertIsNone(error);self.assertEqual(calls,2)
        value=json.loads(output.splitlines()[-1]);self.assertEqual(value['stage'],'PREVIEW_V2_RUNTIME_GRANTS_VERIFIED')
        self.assertTrue(value['runtime_grants_mutation'])
        for key in ('schema_mutation','application_data_mutation','runtime_credential_access','runtime_login_tested',
                    'runtime_dml_tested','application_deployed','full_schema_ready','floot_connected','taxi_trips_enabled'):
            self.assertIs(value[key],False)
        reader.stop_proxy.assert_called_once();self.assertNotIn(PASSWORD,output);self.assertNotIn(TOKEN,output)

    def test_changed_baseline_blocks_mutation(self):
        value=m.baseline();value['role_setting_rows']=1
        error,output,reader,calls=self.invoke(inventory=value)
        self.assertIn('BASELINE_DRIFT',error);self.assertEqual(calls,0);self.assertNotIn('PREFLIGHT_PASSED',output)
        reader.stop_proxy.assert_called_once()

    def test_unconfirmed_commit_has_no_success_or_retry(self):
        error,output,reader,calls=self.invoke(execute_error=SystemExit('STOP: UNCONFIRMED'))
        self.assertIn('UNCONFIRMED',error);self.assertEqual(calls,1);self.assertNotIn('COMMIT_ACKNOWLEDGED',output)
        self.assertNotIn('GRANTS_VERIFIED',output);reader.stop_proxy.assert_called_once()

    def test_failed_readback_does_not_erase_commit_ack_or_claim_verified(self):
        error,output,reader,calls=self.invoke(execute_error=[DIGEST,SystemExit('STOP: READBACK_UNCONFIRMED')])
        self.assertIn('READBACK_UNCONFIRMED',error);self.assertEqual(calls,2)
        self.assertIn('COMMIT_ACKNOWLEDGED',output);self.assertNotIn('GRANTS_VERIFIED',output)
        reader.stop_proxy.assert_called_once()

    def test_disabled_secret_stops_before_credential_or_mutation(self):
        error,output,reader,calls=self.invoke(version=dict(name=r.RESOURCE,state='DISABLED'))
        self.assertIn('VERSION_ONE',error);self.assertEqual(calls,0);reader.read_password.assert_not_called()


def sql_lab_pack():
    """Optional local WASM SQL laboratory; never invokes cloud or a live DB."""
    foundation=args[5]
    names=[name for name,blob in foundation.MIGRATIONS]
    for prefix in ('024','025','026','027','028','029','030','033','031','032','034'):
        matches=[p.name for p in (ROOT/'backend/migrations/versions').glob(prefix+'_*.sql') if not p.stem.endswith('_rollback')]
        if len(matches)!=1:raise RuntimeError('Canonical fixture migration missing')
        names+=matches
    return dict(migrations=[dict(name=n,sql=(ROOT/'backend/migrations/versions'/n).read_text()) for n in names],
        apply=m.build_sql(acl,food,authority,args,sql034),readonly=acl.build_sql(food,authority,args,sql034),
        inventory=m.inventory_query(acl),schema=m.SCHEMA_QUERY,grants=m.grant_sql(),baseline=m.baseline(),
        retained_contract=food.postcondition_sql(authority,args,sql034),readback=m.build_readback_sql(acl,DIGEST))


if __name__=='__main__':
    import sys
    if sys.argv[1:]==['--sql-lab-pack']:print(json.dumps(sql_lab_pack()))
    else:unittest.main()
