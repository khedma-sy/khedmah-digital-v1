"""Isolation and destructive-change regressions for the operator bootstrap."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).resolve().parents[1] / 'scripts/bootstrap-preview-v2.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def project_fixture():
    return {'projectId': m.PROJECT, 'projectNumber': m.NUMBER, 'lifecycleState': 'ACTIVE',
            'parent': {'id': m.ORGANIZATION, 'type': 'organization'}, 'labels': m.LABELS}


def bucket_fixture():
    return {'name': m.STATE_BUCKET, 'projectNumber': m.NUMBER, 'location': m.REGION.upper(),
            'labels': m.LABELS, 'versioning': {'enabled': True},
            'softDeletePolicy': {'retentionDurationSeconds': '2592000'},
            'iamConfiguration': {'uniformBucketLevelAccess': {'enabled': True}, 'publicAccessPrevention': 'enforced'}}


def plan_fixture():
    return {'resource_changes': [
        {'address': kind + '.' + name, 'mode': 'managed',
         'provider_name': 'registry.terraform.io/hashicorp/google',
         'change': {'actions': ['create'], 'after': copy.deepcopy(values)}}
        for kind, entries in m.manifest()['resource'].items() for name, values in entries.items()
    ]}


class BootstrapTests(unittest.TestCase):
    def test_matching_project_and_enabled_apis(self):
        m.validate_project(project_fixture(), {'projectId': m.PROJECT, 'billingEnabled': True},
                           [{'config': {'name': name}, 'state': 'ENABLED'} for name in m.CORE_APIS])

    def test_production_project_rejected(self):
        p = project_fixture(); p['projectId'] = 'khedma-dl'
        with self.assertRaisesRegex(m.Stop, 'PROJECT_IDENTITY_MISMATCH'):
            m.validate_project(p, {}, [])

    def test_missing_core_api_rejected(self):
        with self.assertRaisesRegex(m.Stop, 'CORE_API_MISSING'):
            m.validate_project(project_fixture(), {'projectId': m.PROJECT, 'billingEnabled': True}, [])

    def test_bucket_owned_by_foreign_project_rejected(self):
        b = bucket_fixture(); b['projectNumber'] = '311026134906'
        with self.assertRaisesRegex(m.Stop, 'IDENTITY_MISMATCH'): m.validate_bucket(b)

    def test_state_bucket_without_protection_rejected(self):
        b = bucket_fixture(); b['iamConfiguration']['publicAccessPrevention'] = 'inherited'
        with self.assertRaisesRegex(m.Stop, 'ACCESS_MISMATCH'): m.validate_bucket(b)

    def test_state_bucket_without_recovery_rejected(self):
        for key in ('versioning', 'softDeletePolicy'):
            b = bucket_fixture(); b.pop(key)
            with self.assertRaises(m.Stop): m.validate_bucket(b)

    def test_create_and_noop_are_accepted(self):
        p = plan_fixture(); self.assertEqual(m.validate_plan(p), (len(p['resource_changes']), 0))
        for r in p['resource_changes']: r['change']['actions'] = ['no-op']
        self.assertEqual(m.validate_plan(p), (0, len(p['resource_changes'])))

    def test_update_delete_and_replacement_rejected(self):
        for actions in (['update'], ['delete'], ['delete', 'create'], ['create', 'delete']):
            p = plan_fixture(); p['resource_changes'][0]['change']['actions'] = actions
            with self.assertRaisesRegex(m.Stop, 'NONCREATE_CHANGE'): m.validate_plan(p)

    def test_storage_plan_uses_provider_canonical_location(self):
        resources = m.manifest()['resource']
        self.assertEqual(resources['google_storage_bucket']['build_source']['location'], 'EUROPE-WEST1')
        self.assertEqual(resources['google_artifact_registry_repository']['images']['location'], 'europe-west1')
        self.assertEqual(resources['google_sql_database_instance']['preview']['region'], 'europe-west1')
        p = plan_fixture()
        bucket = next(r for r in p['resource_changes'] if r['address'] == 'google_storage_bucket.build_source')
        # Literal provider-shaped output, independent of the generated manifest.
        bucket['change']['after']['location'] = 'EUROPE-WEST1'
        self.assertEqual(m.validate_plan(p), (59, 0))

    def test_source_bucket_includes_bounded_metadata_reader(self):
        grants = m.manifest()['resource']['google_storage_bucket_iam_member']
        self.assertEqual(grants['source_deployer_metadata'], {
            'bucket': '${google_storage_bucket.build_source.name}',
            'role': 'roles/storage.bucketViewer',
            'member': 'serviceAccount:' + m.email('deployer'),
            'depends_on': ['google_service_account.deployer'],
        })

    def test_storage_wrong_or_unknown_location_rejected(self):
        for location in ('EU', 'US-CENTRAL1', '', None):
            with self.subTest(location=location):
                p = plan_fixture()
                bucket = next(r for r in p['resource_changes'] if r['address'] == 'google_storage_bucket.build_source')
                bucket['change']['after']['location'] = location
                with self.assertRaisesRegex(m.Stop, 'VALUE_MISMATCH_location'):
                    m.validate_plan(p)

    def test_nonstorage_region_checks_remain_exact(self):
        for address, key, value in (
            ('google_artifact_registry_repository.images', 'location', 'EUROPE-WEST1'),
            ('google_artifact_registry_repository.images', 'location', 'us-central1'),
            ('google_sql_database_instance.preview', 'region', 'us-central1'),
        ):
            with self.subTest(address=address, value=value):
                p = plan_fixture()
                item = next(r for r in p['resource_changes'] if r['address'] == address)
                item['change']['after'][key] = value
                with self.assertRaisesRegex(m.Stop, 'VALUE_MISMATCH_' + key):
                    m.validate_plan(p)

    def test_existing_verified_state_bucket_is_reused_with_fresh_plan(self):
        def cloud(*args):
            if args[0] == 'config': return '(unset)'
            if args[0] == 'projects': return json.dumps(project_fixture())
            if args[0] == 'billing': return json.dumps({'projectId': m.PROJECT, 'billingEnabled': True})
            if args[0] == 'services':
                return json.dumps([{'config': {'name': n}, 'state': 'ENABLED'} for n in m.CORE_APIS])
            if args[0] == 'auth': return 'mock-token'
            if args[0] == 'sql':
                return json.dumps({'project': m.PROJECT, 'name': m.INSTANCE, 'region': m.REGION,
                                   'state': 'RUNNABLE', 'connectionName': f'{m.PROJECT}:{m.REGION}:{m.INSTANCE}'})
            self.fail('unexpected cloud command')

        def run(cmd, label, *args, **kwargs):
            if label == 'TERRAFORM_PLAN_READ': return json.dumps(plan_fixture())
            if label == 'TERRAFORM_OUTPUT':
                return json.dumps({'project_id': {'value': m.PROJECT},
                                   'connection_name': {'value': f'{m.PROJECT}:{m.REGION}:{m.INSTANCE}'}})
            return ''

        with tempfile.TemporaryDirectory() as home, patch.object(m.Path, 'home', return_value=Path(home)), \
             patch.object(m.shutil, 'which', return_value='/mock/terraform'), \
             patch.object(m.Runner, 'cloud', side_effect=cloud), \
             patch.object(m.Runner, 'api', return_value=bucket_fixture()) as api, \
             patch.object(m.Runner, 'run', side_effect=run) as execute, patch.object(m, 'emit'), patch('builtins.print'):
            m.Runner().apply()
            self.assertEqual(api.call_count, 2)
            self.assertTrue(all(call.args == ('/b/' + m.STATE_BUCKET,) for call in api.call_args_list))
            labels = [call.args[1] for call in execute.call_args_list]
            self.assertLess(labels.index('TERRAFORM_PLAN'), labels.index('TERRAFORM_PLAN_READ'))
            self.assertLess(labels.index('TERRAFORM_PLAN_READ'), labels.index('TERRAFORM_APPLY'))

    def test_extra_or_missing_resource_rejected(self):
        for mutate in (lambda p: p['resource_changes'].pop(),
                       lambda p: p['resource_changes'].append(copy.deepcopy(p['resource_changes'][0]))):
            p = plan_fixture(); mutate(p)
            with self.assertRaisesRegex(m.Stop, 'RESOURCE_SET_MISMATCH'): m.validate_plan(p)

    def test_foreign_project_or_principal_rejected(self):
        p = plan_fixture(); p['resource_changes'][0]['change']['after']['project'] = 'khedma-dl'
        with self.assertRaisesRegex(m.Stop, 'FOREIGN_PROJECT'): m.validate_plan(p)
        p = plan_fixture()
        r = next(r for r in p['resource_changes'] if 'member' in r['change']['after'])
        r['change']['after']['member'] = 'allUsers'
        with self.assertRaisesRegex(m.Stop, 'VALUE_MISMATCH_member'): m.validate_plan(p)

    def test_drift_deferred_or_errored_plans_rejected(self):
        for key, value in [('resource_drift', [{'address': 'example'}]), ('deferred_changes', [{}]), ('errored', True)]:
            p = plan_fixture(); p[key] = value
            with self.assertRaises(m.Stop): m.validate_plan(p)

    def test_secret_access_separated_and_no_credential_payloads(self):
        resources = m.manifest()['resource']
        self.assertNotIn('google_secret_manager_secret_version', resources)
        self.assertNotIn('google_sql_user', resources)
        self.assertNotIn('google_service_account_key', resources)
        grants = resources['google_secret_manager_secret_iam_member']
        self.assertEqual(grants['DATABASE_URL_payload']['member'], 'serviceAccount:' + m.email('runtime'))
        self.assertEqual(grants['DATABASE_MIGRATION_URL_payload']['member'], 'serviceAccount:' + m.email('migrator'))
        self.assertFalse(any(x['member'] == 'serviceAccount:' + m.email('frontend') for x in grants.values()))
        self.assertFalse(any(x['role'] in ('roles/owner', 'roles/editor', 'roles/secretmanager.secretAccessor')
                             for x in resources['google_project_iam_member'].values()))

    def test_no_authorized_network_or_public_iam(self):
        resources = m.manifest()['resource']
        ip = resources['google_sql_database_instance']['preview']['settings']['ip_configuration']
        self.assertNotIn('authorized_networks', ip)
        self.assertNotIn('allUsers', json.dumps(resources))
        self.assertNotIn('allAuthenticatedUsers', json.dumps(resources))

    def test_default_invocation_does_not_call_cloud(self):
        with patch.object(m.sys, 'argv', ['bootstrap-preview-v2.py']), patch.object(m.Runner, 'apply') as apply:
            m.main(); apply.assert_not_called()

    def test_redirects_refused(self):
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, None, None, None, None))


if __name__ == '__main__':
    unittest.main()
