import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_source_read', ROOT / 'scripts/inspect-preview-v2-build-source.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class BuildSourceReadTests(unittest.TestCase):
    def fake(self, cmd, **kwargs):
        self.calls.append(cmd)
        self.assertIn('--account=' + self.expected_account, cmd)
        if cmd[1:4] == ['iam', 'roles', 'describe']:
            self.assertNotIn('--project=' + reader.PROJECT, cmd)
            self.assertIn('--billing-project=' + reader.PROJECT, cmd)
        else:
            self.assertIn('--project=' + reader.PROJECT, cmd)
        if cmd[1:4] == ['iam', 'roles', 'describe']:
            self.assertNotIn('CLOUDSDK_CORE_PROJECT', kwargs['env'])
        else:
            self.assertEqual(kwargs['env']['CLOUDSDK_CORE_PROJECT'], reader.PROJECT)
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_DISABLE_PROMPTS'], 'true')
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_LOG_HTTP'], 'false')
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_DISABLE_FILE_LOGGING'], 'true')
        self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
        self.assertLessEqual(kwargs['timeout'], 60)
        if cmd[1:3] == ['config', 'get-value']:
            return subprocess.CompletedProcess(cmd, 0, '(unset)\n', '')
        if cmd[1:3] == ['projects', 'describe']:
            data = dict(projectId=reader.PROJECT, projectNumber=reader.NUMBER,
                        lifecycleState='ACTIVE', parent={'id': '594049370623', 'type': 'organization'})
            if self.foreign:
                data['projectId'] = 'khedma-dl'
        elif cmd[1:4] == ['storage', 'buckets', 'describe']:
            data = dict(name=reader.BUCKET, projectNumber=reader.NUMBER, location='EUROPE-WEST1')
        elif 'get-iam-policy' in cmd:
            data = {'version': 3, 'bindings': [
                {'role': 'roles/storage.objectAdmin', 'members': ['serviceAccount:' + reader.DEPLOYER],
                 'condition': {'expression': 'true', 'title': 'preserved'}},
                {'role': 'roles/owner', 'members': ['user:UNRELATED_IDENTITY_SENTINEL']} ]}
        elif cmd[1:4] == ['iam', 'roles', 'describe']:
            data = {'name': cmd[4], 'includedPermissions': ['storage.objects.get', 'UNRELATED_PERMISSION_SENTINEL']}
        elif cmd[1:3] == ['run', 'services'] and self.denied:
            return subprocess.CompletedProcess(cmd, 1, '', 'PERMISSION_DENIED RAW_ERROR_SENTINEL')
        elif cmd[1] in ('run', 'builds', 'logging'):
            data = []
        else:
            self.fail('unexpected command: ' + repr(cmd))
        return subprocess.CompletedProcess(cmd, 0, json.dumps(data), '')

    def setUp(self):
        self.calls = []
        self.foreign = False
        self.denied = False
        self.expected_account = reader.OWNER_ACCOUNT

    def execute(self, actions=False):
        output = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), patch.object(reader.subprocess, 'run', self.fake), contextlib.redirect_stdout(output):
            reader.inspect(actions=actions)
        return output.getvalue(), [json.loads(line) for line in output.getvalue().splitlines()]

    def test_happy_path_is_metadata_only_and_redacts_unrelated_policy(self):
        text, receipts = self.execute()
        self.assertNotIn('SENTINEL', text)
        self.assertTrue(receipts[-1]['bounded_inventories_complete'])
        self.assertFalse(receipts[-1]['retry_authorized'])
        self.assertFalse(receipts[-1]['root_cause_proven'])
        self.assertIn('preserved', text)
        forbidden = {'create', 'update', 'delete', 'execute', 'submit', 'deploy', 'add-iam-policy-binding',
                     'set-iam-policy', 'enable', 'print-access-token', 'secrets', 'objects'}
        self.assertFalse(any(forbidden.intersection(cmd) for cmd in self.calls))
        build = next(cmd for cmd in self.calls if cmd[1:3] == ['builds', 'list'])
        self.assertIn('--region=europe-west1', build)
        self.assertIn('--limit=101', build)
        audit = next(cmd for cmd in self.calls if cmd[1:3] == ['logging', 'read'])
        self.assertIn(reader.START, audit[3])
        self.assertIn(reader.END, audit[3])
        self.assertIn(reader.DEPLOYER, audit[3])
        self.assertIn('--limit=31', audit)

    def test_denial_is_never_reported_as_empty_or_complete(self):
        self.denied = True
        text, receipts = self.execute()
        self.assertNotIn('RAW_ERROR_SENTINEL', text)
        services = next(r for r in receipts if r['stage'].endswith('SERVICES'))
        self.assertEqual(services['outcome'], 'PERMISSION_DENIED')
        self.assertFalse(services['empty_observed'])
        self.assertFalse(services['inventory_complete'])
        self.assertFalse(receipts[-1]['bounded_inventories_complete'])

    def test_foreign_project_stops_before_resource_reads(self):
        self.foreign = True
        with self.assertRaisesRegex(SystemExit, 'PROJECT_IDENTITY_UNCONFIRMED'):
            self.execute()
        self.assertEqual(len(self.calls), 4)

    def test_auth_override_stops_before_any_cloud_call(self):
        with patch.dict(os.environ, {'CLOUDSDK_AUTH_ACCESS_TOKEN': 'INERT'}, clear=True), patch.object(reader.subprocess, 'run', self.fake):
            with self.assertRaisesRegex(SystemExit, 'AUTH_OVERRIDE_PRESENT'):
                reader.inspect()
        self.assertEqual(self.calls, [])

    def test_actions_mode_requires_exact_context_and_generated_credential_path(self):
        environment = {
            'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'khedma-sy/khedmah-digital-v1',
            'GITHUB_EVENT_NAME': 'pull_request', 'GITHUB_REF': 'refs/pull/274/merge',
            'GITHUB_RUN_ATTEMPT': '1', 'PREVIEW_PR_NUMBER': '274',
            'PREVIEW_EVENT_ACTION': 'synchronize', 'PREVIEW_GOOGLE_CLOUD_PROJECT': reader.PROJECT,
            'PREVIEW_V2_DEPLOYER_SERVICE_ACCOUNT': reader.DEPLOYER_ACCOUNT,
            'GOOGLE_GHA_CREDS_PATH': '/tmp/gha-creds-inert.json',
            'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE': '/tmp/gha-creds-inert.json',
        }
        output = io.StringIO()
        def actions_fake(cmd, **kwargs):
            return self.fake(cmd, **kwargs)
        self.expected_account = reader.DEPLOYER_ACCOUNT
        with patch.dict(os.environ, environment, clear=True), patch.object(reader.subprocess, 'run', actions_fake), contextlib.redirect_stdout(output):
            reader.inspect(actions=True)
        self.assertIn('PREVIEW_V2_BUILD_SOURCE_RECONCILIATION_READ_COMPLETED', output.getvalue())
        for changed in ({**environment, 'GITHUB_RUN_ATTEMPT': '2'},
                        {**environment, 'GOOGLE_GHA_CREDS_PATH': '/tmp/foreign.json'}):
            with patch.dict(os.environ, changed, clear=True), patch.object(reader.subprocess, 'run', lambda *a, **k: self.fail('cloud read')):
                with self.assertRaises(SystemExit):
                    reader.inspect(actions=True)

    def test_full_page_is_not_complete_inventory(self):
        output = io.StringIO()
        with patch.object(reader, 'cloud', return_value=({'outcome': 'OK'}, [{}] * 31)), contextlib.redirect_stdout(output):
            complete = reader.bounded_list('TEST', ('logging', 'read'), 'timestamp', 31, reader.OWNER_ACCOUNT)
        self.assertFalse(complete)
        self.assertFalse(json.loads(output.getvalue())['inventory_complete'])


if __name__ == '__main__':
    unittest.main()
