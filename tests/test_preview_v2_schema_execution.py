"""Run all schema helper shells with a recording, non-network cloud CLI."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPERS = sorted((ROOT / 'scripts/deployment').glob('ensure-*-nonproduction-schema.sh'))
PROJECT = 'khedmah-preview-v2-20261012'
DOMAIN = PROJECT + '.iam.gserviceaccount.com'


class ExecutionTests(unittest.TestCase):
    def invoke(self, helper, environment='preview', overrides=None, real_node=False):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp); log = folder / 'calls.jsonl'
            cloud = folder / 'gcloud'
            cloud.write_text('#!/usr/bin/env python3\nimport json,os,sys\n'
                'with open(os.environ["CALL_LOG"],"a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n')
            cloud.chmod(0o755)
            if not real_node:
                node = folder / 'node'
                node.write_text('#!/usr/bin/env python3\nimport sys\n'
                    'assert sys.argv[1].endswith("preview-schema-job-pool.mjs")\n'
                    'assert sys.argv[2] in ("name","before-deploy","before-execute")\n'
                    'if sys.argv[2]=="name": print("test-schema-"+sys.argv[-1])\n')
                node.chmod(0o755)
            env = dict(os.environ, PATH=str(folder) + os.pathsep + os.environ['PATH'], CALL_LOG=str(log),
                GOOGLE_CLOUD_PROJECT=PROJECT, GOOGLE_CLOUD_REGION='europe-west1',
                PRODUCTION_GOOGLE_CLOUD_PROJECT='khedma-dl', ARTIFACT_REPOSITORY='khedmah-preview',
                RUNTIME_SERVICE_ACCOUNT='khedmah-pv2-runtime@' + DOMAIN,
                CLOUD_SQL_INSTANCE_CONNECTION_NAME=PROJECT + ':europe-west1:khedmah-preview-v2-db')
            for path in HELPERS:
                for key in re.findall(r'\$\{([A-Z_0-9]+_MODE):-off\}', path.read_text()): env[key] = 'verify'
            env.update(overrides or {})
            result = subprocess.run(['bash', str(helper), environment, 'pr-274-' + 'a' * 40],
                cwd=ROOT, env=env, text=True, capture_output=True, timeout=30)
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result, calls

    @staticmethod
    def argument(call, name):
        if name in call: return call[call.index(name) + 1]
        return next(value.split('=', 1)[1] for value in call if value.startswith(name + '='))

    def test_all_nine_helpers_use_migrator_version_one_and_dedicated_build_storage(self):
        self.assertEqual(len(HELPERS), 9)
        for helper in HELPERS:
            with self.subTest(helper=helper.name):
                result, calls = self.invoke(helper)
                self.assertEqual(result.returncode, 0, result.stderr)
                builds = [c for c in calls if c[:2] == ['builds', 'submit']]
                jobs = [c for c in calls if c[:3] == ['run', 'jobs', 'deploy']]
                self.assertTrue(builds); self.assertEqual(len(builds), len(jobs))
                for call in builds:
                    self.assertEqual(self.argument(call, '--service-account'),
                        'projects/' + PROJECT + '/serviceAccounts/khedmah-pv2-build@' + DOMAIN)
                    self.assertEqual(self.argument(call, '--gcs-source-staging-dir'),
                        'gs://' + PROJECT + '-cloudbuild-source/source')
                for call in jobs:
                    self.assertEqual(self.argument(call, '--service-account'), 'khedmah-pv2-migrator@' + DOMAIN)
                    self.assertEqual(self.argument(call, '--set-secrets'), 'DATABASE_URL=DATABASE_MIGRATION_URL:1')
                    self.assertEqual(self.argument(call, '--max-retries'), '0')
                self.assertTrue(all(self.argument(c, '--project') == PROJECT for c in calls))

    def test_invalid_replacement_identity_stops_before_any_cloud_command(self):
        for overrides in ({'RUNTIME_SERVICE_ACCOUNT': 'foreign@' + DOMAIN},
                          {'GOOGLE_CLOUD_REGION': 'us-central1'},
                          {'ARTIFACT_REPOSITORY': 'other'},
                          {'CLOUD_SQL_INSTANCE_CONNECTION_NAME': PROJECT + ':europe-west1:other'},
                          {'PRODUCTION_GOOGLE_CLOUD_PROJECT': 'other'}):
            with self.subTest(overrides=overrides):
                result, calls = self.invoke(HELPERS[0], overrides=overrides)
                self.assertNotEqual(result.returncode, 0); self.assertEqual(calls, [])
        result, calls = self.invoke(HELPERS[0], environment='staging')
        self.assertNotEqual(result.returncode, 0); self.assertEqual(calls, [])

    def test_staging_retains_existing_identity_secret_and_build_behavior(self):
        project = 'khedmah-staging-fixture'
        for helper in HELPERS:
            with self.subTest(helper=helper.name):
                result, calls = self.invoke(helper, environment='staging', overrides={
                    'GOOGLE_CLOUD_PROJECT': project,
                    'RUNTIME_SERVICE_ACCOUNT': 'runtime@' + project + '.iam.gserviceaccount.com',
                    'CLOUD_SQL_INSTANCE_CONNECTION_NAME': project + ':europe-west1:db'})
                self.assertEqual(result.returncode, 0, result.stderr)
                for call in calls:
                    if call[:3] == ['run', 'jobs', 'deploy']:
                        self.assertEqual(self.argument(call, '--set-secrets'), 'DATABASE_URL=DATABASE_URL:latest')
                        self.assertEqual(self.argument(call, '--service-account'), 'runtime@' + project + '.iam.gserviceaccount.com')
                    if call[:2] == ['builds', 'submit']:
                        self.assertNotIn('--service-account', call)
                        expected = helper.name == 'ensure-foundation-nonproduction-schema.sh'
                        self.assertEqual('--gcs-source-staging-dir' in call, expected)

    def test_replacement_remains_blocked_by_current_pool_target_before_build(self):
        result, calls = self.invoke(HELPERS[0], real_node=True, overrides={
            'PRODUCTION_FIREBASE_PROJECT_ID': 'khedma-dl', 'PREVIEW_SCHEMA_POOL_SERIALIZED': 'true',
            'GITHUB_ACTIONS': 'true', 'GITHUB_WORKFLOW': 'PR Preview',
            'GITHUB_REPOSITORY': 'khedma-sy/khedmah-digital-v1'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('TARGET_OR_SERIALIZATION_REJECTED', result.stderr)
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
