import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('github_batch', ROOT / 'scripts/configure-preview-v2-github.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
HEAD = 'a' * 40


class Fake:
    def __init__(self):
        self.calls = []
        self.writes = []
        self.pool = None
        self.provider = None
        self.policy = {'etag': 'before'}
        self.values = {'PRODUCTION_GOOGLE_CLOUD_PROJECT': 'khedma-dl',
            'PRODUCTION_FIREBASE_PROJECT_ID': 'khedma-dl', 'STAGING_GOOGLE_CLOUD_PROJECT': 'khedmah-staging-fixture',
            'PREVIEW_GOOGLE_CLOUD_PROJECT': 'khedmah-preview-774201339973', 'UNRELATED_SETTING': 'preserve'}
        self.environment = {'name': 'preview', 'id': 123, 'protection_rules': [{'type': 'required_reviewers'}]}
        self.repository_values = {}
        self.repository = {'full_name': m.REPO, 'id': int(m.REPO_ID), 'owner': {'id': int(m.OWNER_ID)},
                           'permissions': {'admin': True}}
        self.pr = {'number': 274, 'state': 'open', 'merged': False,
            'head': {'sha': HEAD, 'ref': m.BRANCH, 'repo': {'id': int(m.REPO_ID), 'full_name': m.REPO}},
            'base': {'ref': 'main', 'repo': {'id': int(m.REPO_ID)}}}
        self.tree = {'truncated': False, 'tree': [{'path': p, 'type': 'blob', 'sha': s} for p, s in m.SOURCE_BLOBS.items()]}
        self.active = False
        self.permission_failure = False
        self.fail_variable = None
        self.concurrent_on_pool = False
        self.fail_provider_after_create = False

    def github(self, path, method='GET', data=None):
        self.calls.append(('github', path, method))
        if method != 'GET':
            assert path.startswith(m.ENV_BASE + '/variables') and method in ('PATCH', 'POST')
            name = data['name']
            assert name in m.VARIABLES or name == m.READY
            if name == self.fail_variable:
                raise m.Stop('SIMULATED_VARIABLE_WRITE_UNCONFIRMED')
            assert (method == 'PATCH') == (name in self.values)
            self.values[name] = data['value']
            self.environment['updated_at'] = str(len(self.writes))
            self.writes.append(('variable', name, data['value']))
            return None
        if path == 'repos/' + m.REPO:
            result = self.repository
        elif path.endswith('/pulls/274'):
            result = self.pr
        elif '/git/trees/' in path:
            result = self.tree
        elif '/actions/workflows/' in path:
            assert any('status=' + s + '&per_page=1' in path for s in m.ACTIVE_STATUSES)
            result = {'total_count': 1 if self.active else 0, 'workflow_runs': [{}] if self.active else []}
        elif path == m.ENV_BASE:
            result = self.environment
        elif path == m.ENV_BASE + '/variables?per_page=100':
            result = {'total_count': len(self.values), 'variables': [{'name': k, 'value': v} for k, v in self.values.items()]}
        elif path == f'repos/{m.REPO}/actions/variables?per_page=100':
            result = {'total_count': len(self.repository_values), 'variables': [{'name': k, 'value': v} for k, v in self.repository_values.items()]}
        else:
            raise AssertionError(path)
        return copy.deepcopy(result)

    def auth_preflight(self):
        pass

    def permissions(self):
        if self.permission_failure:
            raise m.Stop('GOOGLE_REQUIRED_PERMISSION_MISSING')

    def cloud(self, *args, **kwargs):
        self.calls.append(('cloud', args))
        if args[:2] == ('projects', 'describe'):
            result = {'projectId': m.PROJECT, 'projectNumber': m.NUMBER, 'lifecycleState': 'ACTIVE',
                      'parent': {'id': '594049370623', 'type': 'organization'}}
        elif args[:2] == ('services', 'list'):
            result = [{'config': {'name': s + '.googleapis.com'}, 'state': 'ENABLED'}
                      for s in ('iam', 'iamcredentials', 'sts', 'cloudresourcemanager')]
        elif args[:3] == ('iam', 'service-accounts', 'describe'):
            result = {'projectId': m.PROJECT, 'email': args[3], 'uniqueId': '123456789'}
        elif args[:3] == ('secrets', 'versions', 'describe'):
            assert args[3] == '1' and args[4].startswith('--secret=')
            result = {'name': f'projects/{m.NUMBER}/secrets/{args[4].split("=", 1)[1]}/versions/1', 'state': 'ENABLED'}
        elif args[:3] == ('iam', 'workload-identity-pools', 'list'):
            assert '--show-deleted' in args and '--limit=100' in args
            result = [self.pool] if self.pool else []
        elif args[:4] == ('iam', 'workload-identity-pools', 'providers', 'list'):
            result = [self.provider] if self.provider else []
        elif args[:3] == ('iam', 'service-accounts', 'get-iam-policy'):
            assert args[3] == m.DEPLOYER
            result = self.policy
        elif args[:3] == ('iam', 'workload-identity-pools', 'create'):
            assert args[3] == m.POOL and self.values[m.READY] == 'false'
            self.pool = {'name': m.POOL_NAME, 'state': 'ACTIVE'}
            self.writes.append(('pool',))
            if self.concurrent_on_pool:
                self.values['UNRELATED_SETTING'] = 'changed-elsewhere'
            result = self.pool
        elif args[:4] == ('iam', 'workload-identity-pools', 'providers', 'create-oidc'):
            assert args[4] == m.PROVIDER and self.values[m.READY] == 'false'
            values = dict(x[2:].split('=', 1) for x in args[5:])
            assert values['issuer-uri'] == 'https://token.actions.githubusercontent.com'
            self.provider = {'name': m.PROVIDER_NAME, 'state': 'ACTIVE',
                'attributeMapping': dict(x.split('=', 1) for x in values['attribute-mapping'].split(',')),
                'attributeCondition': values['attribute-condition'], 'oidc': {'issuerUri': values['issuer-uri']}}
            self.writes.append(('provider',))
            if self.fail_provider_after_create:
                raise m.Stop('SIMULATED_UNCERTAIN_PROVIDER_WRITE')
            result = self.provider
        elif args[:3] == ('iam', 'service-accounts', 'set-iam-policy'):
            assert args[3] == m.DEPLOYER and self.values[m.READY] == 'false'
            policy = json.loads(Path(args[4]).read_text())
            assert policy['etag'] == self.policy['etag']
            self.policy = dict(policy, etag='after')
            self.writes.append(('binding',))
            result = self.policy
        else:
            raise AssertionError(args)
        return copy.deepcopy(result)


class BatchTests(unittest.TestCase):
    def execute(self, fake, apply=True):
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(out):
            m.Batch(fake, HEAD, Path(tmp)).execute(apply)
        return out.getvalue()

    def test_full_batch_orders_readiness_last_and_preserves_unrelated_values(self):
        fake = Fake()
        output = self.execute(fake)
        self.assertEqual(fake.writes[0], ('variable', m.READY, 'false'))
        self.assertEqual(fake.writes[-1], ('variable', m.READY, 'true'))
        self.assertEqual([x[0] for x in fake.writes[1:4]], ['pool', 'provider', 'binding'])
        self.assertEqual(fake.values['UNRELATED_SETTING'], 'preserve')
        self.assertEqual({k: fake.values[k] for k in m.VARIABLES}, m.VARIABLES)
        self.assertEqual(fake.policy['bindings'], [{'role': m.ROLE, 'members': [m.MEMBER]}])
        self.assertIn('PREVIEW_V2_WIF_AND_GITHUB_CONFIGURATION_VERIFIED', output)
        final = json.loads(output.strip().splitlines()[-1])
        for key in ('oidc_authentication_verified', 'schema_migrated', 'runtime_object_grants_ready', 'application_deployed', 'floot_connected'):
            self.assertIs(final[key], False)

    def test_read_only_plan_does_not_create_gate_pool_provider_or_binding(self):
        fake = Fake()
        self.assertIn('PLAN_COMPLETE_NO_MUTATION', self.execute(fake, False))
        self.assertEqual(fake.writes, [])

    def test_repository_exclusions_are_supported_without_mutation(self):
        fake = Fake()
        fake.repository_values['STAGING_GOOGLE_CLOUD_PROJECT'] = fake.values.pop('STAGING_GOOGLE_CLOUD_PROJECT')
        before = copy.deepcopy(fake.repository_values)
        self.execute(fake)
        self.assertEqual(fake.repository_values, before)
        self.assertNotIn('STAGING_GOOGLE_CLOUD_PROJECT', fake.values)

    def test_verified_completed_batch_is_read_only_on_repeat(self):
        fake = Fake()
        self.execute(fake)
        fake.writes.clear()
        self.execute(fake)
        self.assertEqual(fake.writes, [])

    def test_uncertain_provider_write_keeps_gate_closed_and_reconciles_exact_existing_state(self):
        fake = Fake(); fake.fail_provider_after_create = True
        with self.assertRaisesRegex(m.Stop, 'UNCERTAIN_PROVIDER'):
            self.execute(fake)
        self.assertEqual(fake.values[m.READY], 'false')
        fake.fail_provider_after_create = False
        self.execute(fake)
        self.assertEqual(sum(x[0] == 'provider' for x in fake.writes), 1)
        self.assertEqual(sum(x[0] == 'pool' for x in fake.writes), 1)

    def test_every_configuration_failure_keeps_readiness_false(self):
        for name in m.VARIABLES:
            with self.subTest(name=name):
                fake = Fake(); fake.fail_variable = name
                with self.assertRaises(m.Stop): self.execute(fake)
                self.assertEqual(fake.values[m.READY], 'false')

    def test_concurrent_variable_change_stops_before_provider_or_binding(self):
        fake = Fake(); fake.concurrent_on_pool = True
        with self.assertRaisesRegex(m.Stop, 'CONCURRENT_CHANGE'): self.execute(fake)
        self.assertEqual([x[0] for x in fake.writes], ['variable', 'pool'])

    def test_stale_head_fork_wrong_repo_no_admin_permissions_and_active_runs_stop_before_writes(self):
        mutations = [lambda f: f.pr['head'].update(sha='b' * 40),
            lambda f: f.pr['head']['repo'].update(id=999),
            lambda f: f.repository.update(id=999),
            lambda f: f.repository['permissions'].update(admin=False),
            lambda f: setattr(f, 'active', True),
            lambda f: setattr(f, 'permission_failure', True),
            lambda f: f.tree.update(truncated=True),
            lambda f: f.tree['tree'][0].update(sha='b' * 40),
            lambda f: f.values.update(PRODUCTION_GOOGLE_CLOUD_PROJECT='other-project'),
            lambda f: f.values.update(STAGING_GOOGLE_CLOUD_PROJECT=m.PROJECT)]
        for change in mutations:
            fake = Fake(); change(fake)
            with self.assertRaises(m.Stop): self.execute(fake)
            self.assertEqual(fake.writes, [])

    def test_existing_provider_or_iam_drift_is_never_overwritten(self):
        good = Fake(); self.execute(good)
        for update in ('condition', 'issuer', 'audience', 'mapping', 'deleted_pool', 'binding'):
            fake = Fake(); fake.pool = copy.deepcopy(good.pool); fake.provider = copy.deepcopy(good.provider)
            if update == 'condition': fake.provider['attributeCondition'] = 'true'
            if update == 'issuer': fake.provider['oidc']['issuerUri'] = 'https://other.invalid'
            if update == 'audience': fake.provider['oidc']['allowedAudiences'] = ['other']
            if update == 'mapping': fake.provider['attributeMapping']['attribute.repository_id'] = 'assertion.repository'
            if update == 'deleted_pool': fake.pool['state'] = 'DELETED'
            if update == 'binding': fake.policy['bindings'] = [{'role': m.ROLE, 'members': ['allUsers']}]
            with self.assertRaises(m.Stop): self.execute(fake)
            self.assertEqual(fake.writes, [])

    def test_trust_predicates_restrict_each_identity_workflow_ref_and_environment(self):
        predicates = []
        for part in m.CONDITION.split(' && '):
            match = re.fullmatch(r"assertion\.([a-z_]+) == '([^']+)'", part)
            self.assertIsNotNone(match)
            predicates.append(match.groups())
        def accepts(claims): return all(claims.get(k) == v for k, v in predicates)
        self.assertTrue(accepts(m.CLAIMS))
        for key in m.CLAIMS:
            self.assertFalse(accepts({**m.CLAIMS, key: 'foreign'}))
            self.assertFalse(accepts({k: v for k, v in m.CLAIMS.items() if k != key}))
        for ref in ('refs/heads/main', 'refs/pull/275/merge'):
            self.assertFalse(accepts({**m.CLAIMS, 'ref': ref}))
        self.assertEqual(m.MAPPING['google.subject'], 'assertion.sub')
        self.assertNotIn('assertion.sub ==', m.CONDITION)  # Supports immutable or legacy subject format.
        self.assertTrue(m.MEMBER.endswith('/attribute.repository_id/1307435925'))

    def test_source_manifest_matches_files_and_js_configuration_contract(self):
        self.assertTrue({
            '.github/workflows/preview-deployment.yml',
            'scripts/deployment/verify-preview-post-rollout-reconciliation.mjs',
            'scripts/deployment/read-preview-post-rollout-reconciliation.mjs',
        }.issubset(m.SOURCE_BLOBS))
        for path, wanted in m.SOURCE_BLOBS.items():
            data = (ROOT / path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(), wanted, path)
        output = subprocess.check_output(['node', '--input-type=module', '-e',
            "import {PREVIEW_V2_VARIABLES} from './scripts/deployment/verify-preview-v2-configuration.mjs';console.log(JSON.stringify(PREVIEW_V2_VARIABLES));"], cwd=ROOT, text=True)
        self.assertEqual(json.loads(output), m.VARIABLES)

    def test_real_runner_pins_cloud_project_account_and_github_stdin_json(self):
        seen = []
        def run(cmd, **kwargs):
            seen.append((cmd, kwargs))
            return subprocess.CompletedProcess(cmd, 0, '{}', '')
        with patch.object(m.subprocess, 'run', run):
            runner = m.Runner()
            runner.cloud('iam', 'workload-identity-pools', 'create', m.POOL, '--location=global')
            runner.github(m.ENV_BASE + '/variables', 'POST', {'name': m.READY, 'value': 'false'})
        cmd, opts = seen[0]
        self.assertIn('--project=' + m.PROJECT, cmd); self.assertIn('--account=' + m.ACCOUNT, cmd)
        self.assertIn('--user-output-enabled', cmd); self.assertNotIn('--user-output-enabled=true', cmd)
        self.assertEqual(opts['env']['CLOUDSDK_CORE_LOG_HTTP'], 'false')
        self.assertEqual(json.loads(seen[1][1]['input']), {'name': m.READY, 'value': 'false'})
        self.assertEqual(seen[1][0][-2:], ['--input', '-'])

    def test_command_errors_are_sanitized_and_not_retried(self):
        sentinel = 'NEVER_PRINT_TOKEN'
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, sentinel, 'PERMISSION_DENIED ' + sentinel)) as run:
            with self.assertRaises(m.Stop) as caught: m.Runner().cloud('projects', 'describe', m.PROJECT)
            self.assertNotIn(sentinel, str(caught.exception)); self.assertEqual(run.call_count, 1)


if __name__ == '__main__':
    unittest.main()
