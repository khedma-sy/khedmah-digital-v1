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

    def test_service_drift_prevents_patch_validation(self):
        before, after = service_fixture(), service_fixture()
        after['etag'] = 'changed'
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[before, after]) as cloud:
            run.return_value.stdout = 'fake-token'
            with self.assertRaisesRegex(SystemExit, 'SERVICE_CHANGED_DURING_SCHEMA_READ'):
                recovery.validate()
        self.assertEqual(cloud.call_count, 2)

    def test_only_validation_request_is_submitted(self):
        service = service_fixture()
        service['latestReadyRevision'] = (
            f'projects/{recovery.PROJECT}/locations/{recovery.REGION}/revisions/{recovery.REVISION}')
        with patch.object(recovery.subprocess, 'run') as run, \
                patch.object(recovery, 'read_predecessor'), \
                patch.object(recovery, 'cloud_json', side_effect=[
                    service, service, {'done': True, 'name': 'test-validation-operation'},
                ]) as cloud, patch('builtins.print'):
            run.return_value.stdout = 'fake-token'
            recovery.validate()
        cloud.assert_called_with('fake-token', recovery.VALIDATE_URL, method='PATCH',
            body={'name': recovery.NAME, 'etag': 'test-etag', 'scaling': {'manualInstanceCount': 1}})

    def test_unknown_cli_never_uses_cloud(self):
        import subprocess
        result = subprocess.run(['python3', str(SCRIPT), '--apply'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ONLY_VALIDATE_IS_AVAILABLE', result.stderr)
