import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('source_grant', ROOT / 'scripts/grant-preview-v2-build-source-metadata.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class GrantTests(unittest.TestCase):
    def setUp(self):
        self.policy = {'version': 1, 'etag': 'etag-1', 'bindings': [
            {'role': 'roles/storage.objectAdmin', 'members': ['serviceAccount:' + m.DEPLOYER]},
            {'role': 'roles/storage.objectViewer', 'members': ['serviceAccount:' + m.BUILD]},
        ]}
        self.calls = []

    def fake(self, command, **kwargs):
        self.calls.append(command)
        if command[1:4] == ['iam', 'roles', 'describe']:
            self.assertIn('--billing-project=' + m.PROJECT, command)
            self.assertNotIn('--project=' + m.PROJECT, command)
        else:
            self.assertIn('--project=' + m.PROJECT, command)
        self.assertIn('--account=' + m.ACCOUNT, command)
        if command[1:3] == ['projects', 'describe']:
            value = {'projectId': m.PROJECT, 'projectNumber': m.NUMBER, 'lifecycleState': 'ACTIVE',
                     'parent': {'id': m.ORGANIZATION, 'type': 'organization'}}
        elif command[1:4] == ['storage', 'buckets', 'describe']:
            value = {'name': m.BUCKET, 'projectNumber': m.NUMBER, 'location': 'EUROPE-WEST1',
                     'iamConfiguration': {'publicAccessPrevention': 'enforced',
                     'uniformBucketLevelAccess': {'enabled': True}}}
        elif command[1:4] == ['iam', 'roles', 'describe']:
            value = {'name': m.ROLE, 'includedPermissions': ['storage.buckets.list', 'storage.buckets.get']}
        elif 'get-iam-policy' in command:
            value = self.policy
        elif 'set-iam-policy' in command:
            with open(command[5], encoding='utf-8') as stream:
                self.policy = json.load(stream)
            value = self.policy
        else:
            self.fail('unexpected command ' + repr(command))
        return subprocess.CompletedProcess(command, 0, json.dumps(value), '')

    def run_apply(self):
        output = io.StringIO()
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, {}, clear=True), \
             patch.object(m.subprocess, 'run', self.fake), contextlib.redirect_stdout(output):
            m.apply(Path(home) / 'marker')
        return [json.loads(line) for line in output.getvalue().splitlines()]

    def test_exact_bucket_scoped_grant_and_readback(self):
        receipts = self.run_apply()
        self.assertEqual(receipts[-1]['stage'], 'PREVIEW_V2_BUILD_SOURCE_METADATA_GRANT_VERIFIED')
        self.assertTrue(m.policy_state(self.policy))
        writes = [call for call in self.calls if 'set-iam-policy' in call]
        self.assertEqual(len(writes), 1)
        self.assertFalse(any('projects' in call and 'set-iam-policy' in call for call in self.calls))

    def test_public_policy_stops_before_marker_or_write(self):
        self.policy['bindings'].append({'role': 'roles/storage.objectViewer', 'members': ['allUsers']})
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, {}, clear=True), \
             patch.object(m.subprocess, 'run', self.fake):
            with self.assertRaisesRegex(SystemExit, 'PUBLIC_BUCKET_BINDING'):
                m.apply(Path(home) / 'marker')
        self.assertFalse(any('set-iam-policy' in call for call in self.calls))

    def test_existing_grant_stops_without_write(self):
        self.policy['bindings'].append({'role': m.ROLE, 'members': [m.MEMBER]})
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, {}, clear=True), \
             patch.object(m.subprocess, 'run', self.fake):
            with self.assertRaisesRegex(SystemExit, 'ALREADY_PRESENT'):
                m.apply(Path(home) / 'marker')
        self.assertFalse(any('set-iam-policy' in call for call in self.calls))

    def test_auth_override_stops_before_cloud(self):
        with patch.dict(os.environ, {'CLOUDSDK_AUTH_ACCESS_TOKEN': 'inert'}, clear=True), \
             patch.object(m.subprocess, 'run', self.fake):
            with self.assertRaisesRegex(SystemExit, 'AUTH_OVERRIDE_PRESENT'):
                m.inspect()
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
