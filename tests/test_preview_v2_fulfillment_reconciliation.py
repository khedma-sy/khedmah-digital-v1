"""Read-only reconciliation and redaction checks; mocked cloud/proxy/psql."""
import contextlib
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
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value
d=module('reconcile',ROOT/'scripts/read-preview-v2-fulfillment-reconciliation.py')
t=module('fixtures',ROOT/'tests/test_preview_v2_fulfillment.py')

def details():
    return dict(read_only='on',unvalidated_constraint_count=2,unvalidated_constraints=[
        dict(table_name='business_profiles',constraint_name='business_profiles_category_code_fk',kind='f'),
        dict(table_name='service_listings',constraint_name='service_listings_category_code_fk',kind='f')],
        product_flags_count=0,user_trigger_count=5,new_table_names=[],
        driver_document_private_constraint_present=False)

class ReconciliationTests(unittest.TestCase):
    def test_corrected_helper_pin_matches_without_mutation_entrypoints(self):
        b=(ROOT/'scripts/apply-preview-v2-fulfillment.py').read_bytes()
        self.assertEqual(hashlib.sha256(b).hexdigest(),d.HELPER_SHA256)
        self.assertEqual(hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest(),d.HELPER_BLOB)
        source=(ROOT/'scripts/read-preview-v2-fulfillment-reconciliation.py').read_text()
        self.assertNotIn('.apply_fulfillment(',source);self.assertNotIn('.build_sql(',source)
        self.assertNotIn('BEGIN READ WRITE;',source)

    def classify(self,catalog,error=None):
        with patch.object(t.m,'execute_sql',side_effect=error) as execute:
            state=d.classify(t.m,t.p,t.f,t.r,Path('/private'),t.PASSWORD,t.SQL025,t.MIGRATIONS,catalog)
        for call in execute.call_args_list:
            self.assertTrue(call.args[3].startswith('BEGIN READ ONLY;'))
            self.assertNotIn('BEGIN READ WRITE;',call.args[3])
        return state,execute.call_count

    def test_predecessor_present_does_not_retry(self):
        self.assertEqual(self.classify(t.catalog()),('SCHEMA_025_PRESENT_026_028_ABSENT',1))

    def test_committed_state_verified_without_replay(self):
        self.assertEqual(self.classify(t.catalog(True)),('SCHEMA_026_028_PRESENT_VERIFIED_NO_REPLAY',1))

    def test_partial_state_and_contract_failure_hold(self):
        self.assertEqual(self.classify({**t.catalog(),'relation_count':44}),('SCHEMA_PARTIAL_OR_DRIFTED_HOLD',0))
        self.assertEqual(self.classify(t.catalog(),SystemExit('STOP: FAILED')),('SCHEMA_CONTRACT_UNCONFIRMED_HOLD',1))

    def test_details_session_is_private_read_only_and_metadata_only(self):
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            def run(args,**kwargs):
                pgpass=work/'reconciliation.pgpass'
                self.assertEqual(stat.S_IMODE(pgpass.stat().st_mode),0o600)
                self.assertIn(str(work/t.r.CONNECTION).replace(':','\\:'),pgpass.read_text())
                self.assertEqual(args[args.index('-h')+1],str(work/t.r.CONNECTION))
                self.assertNotIn(t.PASSWORD,' '.join(args));self.assertNotIn('PGPASSWORD',kwargs['env'])
                self.assertIn('default_transaction_read_only=on',kwargs['env']['PGOPTIONS'])
                self.assertTrue(kwargs['input'].lstrip().startswith('BEGIN READ ONLY;'))
                self.assertNotIn('FROM public.',kwargs['input'])
                self.assertTrue(kwargs['capture_output'])
                return subprocess.CompletedProcess(args,0,json.dumps(details()),'')
            with patch.object(d.subprocess,'run',side_effect=run):
                self.assertEqual(d.read_details(t.r,work,t.PASSWORD),details())
            self.assertFalse((work/'reconciliation.pgpass').exists())

    def test_failed_details_and_wrong_shape_are_not_printed(self):
        cases=[subprocess.CompletedProcess([],1,t.PASSWORD,t.TOKEN),
               subprocess.CompletedProcess([],0,json.dumps({**details(),'read_only':'off'}),t.TOKEN)]
        for result in cases:
            with tempfile.TemporaryDirectory() as directory,patch.object(d.subprocess,'run',return_value=result):
                out=io.StringIO()
                with contextlib.redirect_stdout(out),self.assertRaises(SystemExit) as error:
                    d.read_details(t.r,Path(directory),t.PASSWORD)
                self.assertEqual(out.getvalue(),'')
                self.assertNotIn(t.PASSWORD,str(error.exception));self.assertNotIn(t.TOKEN,str(error.exception))
                self.assertFalse((Path(directory)/'reconciliation.pgpass').exists())

    def test_orchestration_emits_current_state_without_commit_or_readiness_claim(self):
        fake=Mock()
        for name in ('CONNECTION','PROJECT','INSTANCE','SECRET','RESOURCE','DATABASE'):
            setattr(fake,name,getattr(t.r,name))
        fake.cloud.side_effect=[{},dict(name=t.r.RESOURCE,state='ENABLED'),t.TOKEN.encode()]
        fake.read_password.return_value=t.PASSWORD;fake.read_catalog.return_value=t.catalog()
        helper=Mock();helper.load_sources.return_value=(t.p,t.f,fake,t.SQL025,t.MIGRATIONS)
        proxy=Mock();proxy.poll.return_value=None;works=[]
        def popen(args,**kwargs):
            self.assertNotIn(t.TOKEN,' '.join(args))
            work=Path(args[2].split('=',1)[1]);works.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode),0o700)
            (work/t.r.CONNECTION).mkdir();(work/t.r.CONNECTION/'.s.PGSQL.5432').touch()
            return proxy
        out=io.StringIO()
        with patch.object(d.shutil,'which',return_value='/fake'),patch.object(d,'fetch_blob',return_value=b'fixed'):
            with patch.object(d,'verified_module',return_value=helper),patch.object(d.subprocess,'Popen',side_effect=popen):
                with patch.object(d.stat,'S_ISSOCK',return_value=True),patch.object(d,'read_details',return_value=details()):
                    with patch.object(d,'classify',return_value='SCHEMA_025_PRESENT_026_028_ABSENT'),contextlib.redirect_stdout(out):
                        d.inspect_fulfillment()
        value=json.loads(out.getvalue())
        self.assertEqual(value['table_count'],40)
        self.assertEqual(value['schema_state'],'SCHEMA_025_PRESENT_026_028_ABSENT')
        for key in ('schema_mutation','runtime_grants_mutation','retry_authorized','full_schema_ready',
                    'application_deployed','floot_connected','prior_attempt_commit_or_rollback_proven'):
            self.assertFalse(value[key])
        helper.apply_fulfillment.assert_not_called();helper.build_sql.assert_not_called()
        fake.stop_proxy.assert_called_once_with(proxy)
        for work in works:self.assertFalse(work.exists())
        self.assertNotIn(t.PASSWORD,out.getvalue());self.assertNotIn(t.TOKEN,out.getvalue())

if __name__=='__main__':unittest.main()
