import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'recover-preview-v2-login.py'
SPEC = importlib.util.spec_from_file_location('recovery', SCRIPT)
recovery = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recovery)


def service_fixture():
    return {
        'name': recovery.NAME, 'generation': '9', 'observedGeneration': '9', 'etag': 'test-etag',
        'terminalCondition': {'state': 'CONDITION_SUCCEEDED'},
        'latestReadyRevision': recovery.REVISION, 'latestCreatedRevision': recovery.REVISION,
        'scaling': {'scalingMode': 'MANUAL', 'manualInstanceCount': 0},
        'traffic': [{'type': 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', 'percent': 100}],
        'trafficStatuses': [{'revision': recovery.REVISION, 'percent': 100}],
        'template': {'containers': [{'image': 'backend@' + recovery.DIGEST}]},
    }


def revision_fixture():
    return {
        'name': recovery.NAME + '/revisions/' + recovery.REVISION,
        'service': recovery.NAME,
        'conditions': [{'type': 'Ready', 'state': 'CONDITION_SUCCEEDED'}],
        'containers': [{'image': 'backend@' + recovery.DIGEST}],
    }


def receipt_fixture():
    return {
        'stage': 'PREVIEW_V2_APPROVAL_QUOTA_DIAGNOSTIC_READ_COMPLETED',
        'project': recovery.PROJECT, 'instance': 'khedmah-preview-v2-db',
        'catalog': {
            'database': 'khedmah', 'read_only': 'on', 'classification': 'prerequisite-invalid',
            'required_relation_anchors': True, 'role_column_exact': True, 'quota_columns_exact': True,
            'media_columns_exact': True, 'role_target': True, 'asset_predecessor': True,
            'private_constraint_absent': True, 'quota_target': False,
            'quota_diagnostics': {
                'body_025_exact': True, 'body_036_exact': False, 'routine_count': 1,
                'named_trigger_count': 1, 'user_insert_trigger_count': 1, 'insert_rule_count': 0,
                'routine_failed_checks': [], 'trigger_failed_checks': [],
            },
        },
    }


class RecoveryValidationTests(unittest.TestCase):
    def test_full_revision_resource_name(self):
        self.assertTrue(recovery.revision_matches(recovery.NAME + '/revisions/' + recovery.REVISION))
        self.assertFalse(recovery.revision_matches(f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/revisions/{recovery.REVISION}'))

    def test_scaling_only_with_etag(self):
        self.assertEqual(recovery.recovery_request(service_fixture()), {
            'name': recovery.NAME, 'etag': 'test-etag', 'scaling': {'manualInstanceCount': 1},
        })
        self.assertTrue(recovery.VALIDATE_URL.endswith(
            '?updateMask=scaling.manualInstanceCount&validateOnly=true'))

    def test_tagged_service_rejected(self):
        service = service_fixture()
        service['trafficStatuses'][0]['tag'] = 'unexpected'
        with self.assertRaisesRegex(SystemExit, 'SERVICE_TRAFFIC_CHANGED'):
            recovery.recovery_request(service)

    def test_predecessor_and_successor_are_distinct(self):
        receipt = receipt_fixture()
        recovery.require_predecessor(receipt)
        receipt['catalog']['quota_diagnostics']['body_025_exact'] = False
        with self.assertRaisesRegex(SystemExit, 'DATABASE_PREDECESSOR_NOT_VERIFIED'):
            recovery.require_predecessor(receipt)

    def test_revision_independently_pinned(self):
        recovery.require_revision(service_fixture(), revision_fixture())
        changed = revision_fixture()
        changed['containers'][0]['image'] = 'backend@sha256:deadbeef'
        with self.assertRaisesRegex(SystemExit, 'REVISION_IDENTITY_OR_IMAGE_NOT_VERIFIED'):
            recovery.require_revision(service_fixture(), changed)
        changed = revision_fixture()
        changed['service'] = 'unexpected-service'
        with self.assertRaisesRegex(SystemExit, 'REVISION_IDENTITY_OR_IMAGE_NOT_VERIFIED'):
            recovery.require_revision(service_fixture(), changed)
        changed = revision_fixture()
        changed['conditions'] = [{'type': 'Ready', 'state': 'CONDITION_FAILED'}]
        with self.assertRaisesRegex(SystemExit, 'REVISION_IDENTITY_OR_IMAGE_NOT_VERIFIED'):
            recovery.require_revision(service_fixture(), changed)
        changed = revision_fixture()
        changed['deleteTime'] = '2026-11-04T00:00:00Z'
        with self.assertRaisesRegex(SystemExit, 'REVISION_IDENTITY_OR_IMAGE_NOT_VERIFIED'):
            recovery.require_revision(service_fixture(), changed)

    def test_cloud_run_operation_contract(self):
        valid = {
            'name': f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/operations/example',
            'done': True,
            'response': {'name': recovery.NAME, 'scaling': {'manualInstanceCount': 1}},
        }
        recovery.require_validation_operation(valid)
        for value, reason in [
            ({'name': valid['name']}, 'SCALING_PATCH_VALIDATION_PENDING'),
            ({'name': valid['name'], 'done': False}, 'SCALING_PATCH_VALIDATION_PENDING'),
            ({'name': valid['name'], 'done': True, 'error': {'code': 3}}, 'SCALING_PATCH_VALIDATION_REJECTED'),
            ({'name': 'operations/example', 'done': True}, 'SCALING_PATCH_VALIDATION_OPERATION_INVALID'),
            ({'name': valid['name'], 'done': True, 'response': 'invalid'}, 'SCALING_PATCH_VALIDATION_RESPONSE_INVALID'),
            ({'name': valid['name'], 'done': True}, 'SCALING_PATCH_VALIDATION_RESPONSE_INVALID'),
            ({'name': valid['name'], 'done': True,
              'response': {'name': 'wrong-service', 'scaling': {'manualInstanceCount': 1}}},
             'SCALING_PATCH_VALIDATION_RESPONSE_INVALID'),
            ({'name': valid['name'], 'done': True,
              'response': {'name': recovery.NAME, 'scaling': {'manualInstanceCount': 0}}},
             'SCALING_PATCH_VALIDATION_RESPONSE_INVALID'),
        ]:
            with self.subTest(value=value), self.assertRaisesRegex(SystemExit, reason):
                recovery.require_validation_operation(value)

    def test_service_drift_prevents_patch_validation(self):
        before, after = service_fixture(), service_fixture()
        after['etag'] = 'changed'
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[
                    before, revision_fixture(), after,
                ]) as cloud:
            run.return_value.stdout = 'fake-token'
            with self.assertRaisesRegex(SystemExit, 'SERVICE_CHANGED_DURING_SCHEMA_READ'):
                recovery.validate()
        self.assertEqual(cloud.call_count, 3)

    def test_only_validation_request_is_submitted(self):
        service = service_fixture()
        service['latestReadyRevision'] = recovery.NAME + '/revisions/' + recovery.REVISION
        operation = {
            'name': f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/operations/test',
            'done': True,
            'response': {'name': recovery.NAME, 'scaling': {'manualInstanceCount': 1}},
        }
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[
                    service, revision_fixture(), service, revision_fixture(),
                    operation, service, revision_fixture(),
                ]) as cloud, patch('builtins.print'):
            run.return_value.stdout = 'fake-token'
            recovery.validate()
        self.assertEqual(cloud.call_count, 7)
        self.assertEqual(cloud.call_args_list[4].args[1], recovery.VALIDATE_URL)
        self.assertEqual(cloud.call_args_list[4].kwargs['method'], 'PATCH')
        self.assertEqual(cloud.call_args_list[4].kwargs['body'],
            {'name': recovery.NAME, 'etag': 'test-etag', 'scaling': {'manualInstanceCount': 1}})

    def test_pending_operation_is_polled_read_only(self):
        service = service_fixture()
        operation_name = f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/operations/test'
        pending = {'name': operation_name}
        completed = {
            'name': operation_name,
            'done': True,
            'response': {'name': recovery.NAME, 'scaling': {'manualInstanceCount': 1}},
        }
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[
                    service, revision_fixture(), service, revision_fixture(),
                    pending, pending, completed, service, revision_fixture(),
                ]) as cloud, patch('builtins.print'):
            run.return_value.stdout = 'fake-token'
            recovery.validate()
        self.assertEqual(cloud.call_count, 9)
        self.assertEqual(cloud.call_args_list[6].args[1],
            'https://run.googleapis.com/v2/' + operation_name)
        self.assertEqual(cloud.call_args_list[6].kwargs, {})

    def test_pending_operation_cannot_be_claimed_as_success(self):
        service = service_fixture()
        operation_name = f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/operations/test'
        pending = {'name': operation_name}
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[
                    service, revision_fixture(), service, revision_fixture(),
                    pending, pending, pending, pending,
                ]) as cloud:
            run.return_value.stdout = 'fake-token'
            with self.assertRaisesRegex(SystemExit, 'SCALING_PATCH_VALIDATION_PENDING'):
                recovery.validate()
        self.assertEqual(cloud.call_count, 8)

    def test_service_drift_after_validation_fails_closed(self):
        service = service_fixture()
        changed = service_fixture()
        changed['etag'] = 'changed'
        operation = {
            'name': f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/operations/test',
            'done': True,
            'response': {'name': recovery.NAME, 'scaling': {'manualInstanceCount': 1}},
        }
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[
                    service, revision_fixture(), service, revision_fixture(),
                    operation, changed,
                ]) as cloud:
            run.return_value.stdout = 'fake-token'
            with self.assertRaisesRegex(SystemExit, 'SERVICE_CHANGED_AFTER_VALIDATION'):
                recovery.validate()
        self.assertEqual(cloud.call_count, 6)

    def test_unknown_cli_never_uses_cloud(self):
        import subprocess
        result = subprocess.run(['python3', str(SCRIPT), '--apply'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ONLY_VALIDATE_IS_AVAILABLE', result.stderr)
