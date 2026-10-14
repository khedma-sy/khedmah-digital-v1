"""Offline IAM lifecycle and HTTP contract tests; never contact Google Cloud."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('media_iam', ROOT / 'scripts/configure-preview-v2-media-iam.py')
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
TOKEN = 'private-test-token-never-output'


class Response:
    def __init__(self, value):
        self.raw = json.dumps(value).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size):
        return self.raw[:size]


class Fake:
    def __init__(self):
        self.project = dict(projectId=M.PROJECT, projectNumber=M.NUMBER, lifecycleState='ACTIVE',
                            parent={'type': 'organization', 'id': M.ORGANIZATION})
        self.identity = dict(name='projects/' + M.PROJECT + '/serviceAccounts/' + M.RUNTIME,
                             email=M.RUNTIME, projectId=M.PROJECT, uniqueId='1234567890')
        self.project_policy = dict(etag='project-etag', version=1,
            bindings=[{'role': 'roles/cloudsql.client', 'members': [M.MEMBER]}])
        self.bucket = dict(name=M.BUCKET, projectNumber=M.NUMBER, location='EUROPE-WEST1',
                           iamConfiguration={'uniformBucketLevelAccess': {'enabled': True},
                                             'publicAccessPrevention': 'enforced'})
        self.policy = dict(kind='storage#policy', resourceId=M.RESOURCE, etag='CAI=',
                           bindings=copy.deepcopy(M.LEGACY))
        self.role = None
        self.http_calls = []
        self.cloud_calls = []
        self.hook = None
        self.auth_override = False
        self.grantable_pages = [{'roles': [{'name': M.ROLE_NAME}]}]

    def cloud(self, command, **options):
        self.cloud_calls.append((command, options))
        args = command[1:]
        if args[:2] == ['config', 'get-value']:
            raw = b'unexpected' if self.auth_override else b'(unset)'
        elif args[:2] == ['auth', 'print-access-token']:
            raw = TOKEN.encode()
        else:
            if args[:2] == ['config', 'list']:
                value = {}
            elif args[:2] == ['auth', 'list']:
                value = [{'account': M.ACCOUNT}]
            elif args[:2] == ['projects', 'describe']:
                value = self.project
            elif args[:3] == ['iam', 'service-accounts', 'describe']:
                value = self.identity
            elif args[:2] == ['projects', 'get-iam-policy']:
                value = self.project_policy
            else:
                raise AssertionError(command)
            raw = json.dumps(value).encode()
        return subprocess.CompletedProcess(command, 0, raw, TOKEN.encode())

    def open(self, request, timeout):
        method, url = request.method, request.full_url
        body = json.loads(request.data) if request.data is not None else None
        self.http_calls.append((method, url, body, dict(request.headers), timeout))
        if self.hook:
            self.hook(method, url, body)
        if method == 'GET' and url == M.IAM_ROOT + M.ROLE_NAME:
            if self.role is None:
                raise urllib.error.HTTPError(url, 404, TOKEN, {}, None)
            value = self.role
        elif method == 'POST' and url == M.IAM_ROOT + 'projects/' + M.PROJECT + '/roles':
            assert self.role is None
            assert body == {'roleId': M.ROLE_ID, 'role': M.ROLE}
            self.role = dict(copy.deepcopy(body['role']), name=M.ROLE_NAME, etag='role-etag')
            value = self.role
        elif method == 'POST' and url == M.IAM_ROOT + 'roles:queryGrantableRoles':
            assert body['fullResourceName'] == '//storage.googleapis.com/' + M.RESOURCE
            assert body['view'] == 'BASIC' and body['pageSize'] == 200
            assert set(body) <= {'fullResourceName', 'view', 'pageSize', 'pageToken'}
            value = self.grantable_pages[int(body.get('pageToken', '0'))]
        elif method == 'GET' and url == M.STORAGE_ROOT + '/iam?optionsRequestedPolicyVersion=3':
            value = self.policy
        elif method == 'GET' and url.startswith(M.STORAGE_ROOT + '?fields='):
            value = self.bucket
        elif method == 'PUT' and url == M.STORAGE_ROOT + '/iam':
            if body['etag'] != self.policy['etag']:
                raise urllib.error.HTTPError(url, 412, TOKEN, {}, None)
            self.policy = dict(copy.deepcopy(body), etag='new-etag', kind='storage#policy', resourceId=M.RESOURCE)
            value = self.policy
        else:
            raise AssertionError((method, url))
        return Response(value)

    @property
    def writes(self):
        return [x for x in self.http_calls if x[0] != 'GET'
                and x[1] != M.IAM_ROOT + 'roles:queryGrantableRoles']


class Tests(unittest.TestCase):
    def setUp(self):
        self.fake = Fake()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / 'marker'
        self.output = io.StringIO()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M.subprocess, 'run', side_effect=self.fake.cloud))
        self.stack.enter_context(patch.object(M.urllib.request, 'build_opener', return_value=self.fake))
        self.stack.enter_context(patch.dict(os.environ, {}, clear=True))
        self.stack.enter_context(contextlib.redirect_stdout(self.output))

    def run_apply(self):
        M.run(True, self.directory)

    def rejects(self, action=None, pattern='STOP:'):
        with self.assertRaisesRegex(SystemExit, pattern):
            (action or self.run_apply)()
        self.assertNotIn(TOKEN, self.output.getvalue())

    def test_exact_create_and_conditional_bucket_cas(self):
        self.run_apply()
        self.assertEqual([x[0] for x in self.fake.writes], ['POST', 'PUT'])
        body = self.fake.writes[1][2]
        self.assertEqual(body, dict(version=3, etag='CAI=', bindings=M.LEGACY + [M.BINDING]))
        self.assertEqual(self.fake.role['includedPermissions'],
                         ['storage.objects.create', 'storage.objects.delete', 'storage.objects.get'])
        self.assertEqual(M.BINDING['condition']['expression'],
            "resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('"
            + M.RESOURCE + "/objects/media/')")
        result = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertEqual(result['stage'], 'PREVIEW_V2_MEDIA_IAM_CONFIGURED')
        for key in ('secret_payload_access', 'object_data_access', 'runtime_storage_access_verified',
                    'full_effective_iam_verified', 'application_deployed', 'runtime_binding_configured'):
            self.assertFalse(result[key])
        self.assertNotIn(TOKEN, self.output.getvalue())
        self.assertTrue((self.directory / 'attempt.json').exists())

    def test_gcloud_fixed_account_project_private_capture(self):
        self.run_apply()
        for command, options in self.fake.cloud_calls:
            self.assertIn('--project=' + M.PROJECT, command)
            self.assertIn('--account=' + M.ACCOUNT, command)
            self.assertTrue(options['capture_output'])
            self.assertEqual(options['env']['CLOUDSDK_CORE_LOG_HTTP'], 'false')
            self.assertEqual(options['env']['CLOUDSDK_CORE_DISABLE_FILE_LOGGING'], 'true')
            self.assertNotIn(TOKEN, str(command))

    def test_http_token_only_in_header_and_exact_hosts(self):
        self.run_apply()
        for method, url, body, headers, timeout in self.fake.http_calls:
            self.assertEqual(headers['Authorization'], 'Bearer ' + TOKEN)
            self.assertNotIn(TOKEN, url + str(body))
            self.assertTrue(url.startswith((M.IAM_ROOT, M.STORAGE_ROOT)))
            self.assertEqual(timeout, 45)

    def test_wrong_project_stops_before_http(self):
        self.fake.project['projectNumber'] = '123456'
        self.rejects(pattern='PROJECT_IDENTITY_MISMATCH')
        self.assertEqual(self.fake.http_calls, [])

    def test_env_auth_and_endpoint_overrides_rejected(self):
        for key in ('CLOUDSDK_AUTH_ACCESS_TOKEN', 'CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE'):
            with self.subTest(key=key), patch.dict(os.environ, {key: TOKEN}):
                self.rejects()
        self.assertEqual(self.fake.http_calls, [])

    def test_config_auth_override_rejected(self):
        self.fake.auth_override = True
        self.rejects(pattern='AUTH_OVERRIDE')
        self.assertEqual(self.fake.http_calls, [])

    def test_wrong_disabled_or_replaced_runtime_rejected(self):
        for change in ({'disabled': True}, {'email': 'other'}, {'projectId': 'other'}, {'uniqueId': ''}):
            with self.subTest(change=change):
                original = copy.deepcopy(self.fake.identity)
                self.fake.identity.update(change)
                self.rejects(pattern='RUNTIME_IDENTITY')
                self.fake.identity = original
        self.assertEqual(self.fake.writes, [])

    def test_public_or_extra_runtime_project_grants_rejected(self):
        for binding in ({'role': 'roles/viewer', 'members': ['allUsers']},
                        {'role': 'roles/storage.admin', 'members': [M.MEMBER]}):
            with self.subTest(binding=binding):
                self.fake.project_policy['bindings'].append(binding)
                self.rejects()
                self.fake.project_policy['bindings'].pop()
        self.assertEqual(self.fake.writes, [])

    def test_bucket_identity_pap_and_ubla_guards(self):
        for field, value in [('name', 'foreign'), ('projectNumber', '123'), ('location', 'US')]:
            with self.subTest(field=field):
                original = self.fake.bucket[field]
                self.fake.bucket[field] = value
                self.rejects(pattern='BUCKET_IDENTITY')
                self.fake.bucket[field] = original
        self.fake.bucket['iamConfiguration']['publicAccessPrevention'] = 'inherited'
        self.rejects(pattern='PAP_OR_UBLA')
        self.fake.bucket['iamConfiguration']['publicAccessPrevention'] = 'enforced'
        self.fake.bucket['iamConfiguration']['uniformBucketLevelAccess']['enabled'] = False
        self.rejects(pattern='PAP_OR_UBLA')
        self.assertEqual(self.fake.writes, [])

    def test_unexpected_bucket_binding_never_overwritten(self):
        self.fake.policy['bindings'].append({'role': 'roles/storage.objectViewer', 'members': ['allUsers']})
        self.rejects(pattern='POLICY_CHANGED_OR_UNEXPECTED')
        self.assertEqual(self.fake.writes, [])

    def test_already_existing_or_deleted_role_not_adopted(self):
        self.fake.role = {'name': M.ROLE_NAME, 'deleted': True}
        self.rejects(pattern='ALREADY_EXISTS')
        self.assertEqual(self.fake.writes, [])

    def test_reordered_legacy_bindings_preserved(self):
        self.fake.policy['bindings'].reverse()
        for binding in self.fake.policy['bindings']:
            binding['members'].reverse()
        expected = copy.deepcopy(self.fake.policy['bindings'])
        self.run_apply()
        self.assertEqual(self.fake.writes[-1][2]['bindings'][:-1], expected)

    def test_private_marker_blocks_replay_even_if_role_absent(self):
        M.marker(self.directory)
        self.rejects(pattern='PREVIOUS_MEDIA_IAM_ATTEMPT')
        self.assertEqual(self.fake.writes, [])

    def test_marker_symlink_and_public_directory_rejected(self):
        target = Path(self.temp.name) / 'target'
        target.mkdir()
        self.directory.symlink_to(target)
        self.rejects(pattern='ATTEMPT_PATH_REJECTED')
        self.directory.unlink()
        self.directory.mkdir(mode=0o755)
        self.directory.chmod(0o755)
        self.rejects(pattern='NOT_PRIVATE')
        self.assertEqual(self.fake.writes, [])

    def test_role_creation_uncertainty_stops_no_retry_or_bucket_write(self):
        def hook(method, url, body):
            if method == 'POST':
                raise OSError(TOKEN)
        self.fake.hook = hook
        self.rejects(pattern='REQUEST_UNCONFIRMED')
        self.assertEqual(len(self.fake.writes), 1)
        self.assertTrue((self.directory / 'attempt.json').exists())

    def test_role_permission_drift_stops_before_binding(self):
        def hook(method, url, body):
            if method == 'GET' and self.fake.role is not None:
                self.fake.role['includedPermissions'].append('storage.objects.list')
        self.fake.hook = hook
        self.rejects(pattern='CUSTOM_ROLE_CONTRACT')
        self.assertEqual([x[0] for x in self.fake.writes], ['POST'])

    def test_project_drift_after_create_stops_before_binding(self):
        def hook(method, url, body):
            if method == 'POST':
                self.fake.project_policy['etag'] = 'changed'
        self.fake.hook = hook
        self.rejects(pattern='PRE_BINDING_STATE_CHANGED')
        self.assertEqual([x[0] for x in self.fake.writes], ['POST'])

    def test_bucket_policy_race_rejected_by_etag_no_retry(self):
        def hook(method, url, body):
            if method == 'PUT':
                self.fake.policy['etag'] = 'concurrent-update'
        self.fake.hook = hook
        self.rejects(pattern='HTTP_412')
        self.assertEqual(len(self.fake.writes), 2)

    def test_denial_not_absence_and_redirect_not_followed(self):
        for status in (301, 403, 500):
            with self.subTest(status=status):
                def hook(method, url, body):
                    raise urllib.error.HTTPError(url, status, TOKEN, {}, None)
                self.fake.hook = hook
                self.rejects(pattern='HTTP_' + str(status))
        self.assertEqual(self.fake.writes, [])
        self.assertIsNone(M.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid'))

    def test_inspect_absent_and_applied_are_readonly_and_no_retry_authorization(self):
        M.run(False, self.directory)
        self.assertEqual(self.fake.writes, [])
        self.assertFalse(self.directory.exists())
        self.run_apply()
        self.fake.http_calls.clear()
        M.run(False, self.directory)
        result = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertTrue(result['expected_direct_binding_present'])
        self.assertFalse(result['retry_authorized'])
        self.assertFalse(result['cloud_mutation'])
        self.assertEqual(self.fake.writes, [])

    def test_condition_broadening_fails_readback(self):
        self.run_apply()
        self.fake.policy['bindings'][-1]['condition']['expression'] = 'true'
        self.fake.http_calls.clear()
        self.rejects(lambda: M.run(False, self.directory), 'POLICY_CHANGED_OR_UNEXPECTED')
        self.assertEqual(self.fake.writes, [])

    def test_client_rejects_unexpected_write_arguments(self):
        client = M.Client(TOKEN)
        self.rejects(lambda: client.request('set-policy', policy={}), 'POLICY_CHANGED_OR_UNEXPECTED')
        self.rejects(lambda: client.request('delete'), 'REQUEST_SCOPE_REJECTED')
        self.assertEqual(self.fake.http_calls, [])

    def prepare_completion(self):
        M.marker(self.directory)
        self.fake.role = dict(copy.deepcopy(M.ROLE), name=M.ROLE_NAME, etag='role-etag')

    def run_completion(self):
        M.run(directory=self.directory, complete=True)

    def test_original_hierarchy_failure_then_reviewed_completion_only_binds(self):
        def reject_binding(method, url, body):
            if method == 'PUT':
                raw = json.dumps({'error': {'message': "Role (" + M.ROLE_NAME
                    + ") does not exist in the resource's hierarchy."}}).encode()
                raise urllib.error.HTTPError(url, 400, TOKEN, {}, io.BytesIO(raw))
        self.fake.hook = reject_binding
        self.rejects(pattern='HTTP_400')
        failure = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertEqual(failure['request_kind'], 'set-policy')
        self.assertEqual(failure['recognized_reason'], 'ROLE_NOT_IN_RESOURCE_HIERARCHY')
        self.assertFalse(failure['retry_authorized'])
        role = copy.deepcopy(self.fake.role)
        original = (self.directory / 'attempt.json').read_bytes()
        self.fake.hook = None
        self.fake.http_calls.clear()
        M.run(False, self.directory)
        self.assertFalse(json.loads(self.output.getvalue().splitlines()[-1])['expected_direct_binding_present'])
        self.run_completion()
        self.assertEqual([x[0] for x in self.fake.writes], ['PUT'])
        self.assertEqual(self.fake.writes[0][2], dict(version=3, etag='CAI=', bindings=M.LEGACY + [M.BINDING]))
        self.assertEqual(self.fake.role, role)
        self.assertEqual((self.directory / 'attempt.json').read_bytes(), original)
        result = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertEqual(result['stage'], 'PREVIEW_V2_MEDIA_BINDING_COMPLETION_VERIFIED')
        for key in ('custom_role_created', 'full_effective_iam_verified', 'runtime_storage_access_verified',
                    'object_data_access', 'secret_payload_access', 'application_deployed', 'floot_connected'):
            self.assertFalse(result[key])
        self.assertNotIn(TOKEN, self.output.getvalue())

    def test_completion_requires_original_private_marker(self):
        self.fake.role = dict(copy.deepcopy(M.ROLE), name=M.ROLE_NAME, etag='role-etag')
        with self.assertRaises(OSError):
            self.run_completion()
        self.assertEqual(self.fake.writes, [])
        self.prepare_completion()
        (self.directory / 'attempt.json').chmod(0o644)
        self.rejects(self.run_completion, 'ORIGINAL_ATTEMPT_FILE')
        (self.directory / 'attempt.json').chmod(0o600)
        (self.directory / 'attempt.json').write_text('{"project":"foreign"}')
        self.rejects(self.run_completion, 'ORIGINAL_ATTEMPT_RECORD')
        self.assertEqual(self.fake.writes, [])

    def test_completion_rejects_symlink_original_marker(self):
        self.prepare_completion()
        original = self.directory / 'attempt.json'
        other = self.directory / 'saved.json'
        original.rename(other)
        original.symlink_to(other)
        with self.assertRaises(OSError):
            self.run_completion()
        self.assertEqual(self.fake.writes, [])

    def test_completion_absent_deleted_or_broad_role_never_recreated(self):
        self.prepare_completion()
        for role in (None, dict(self.fake.role, deleted=True),
                     dict(self.fake.role, includedPermissions=M.PERMISSIONS + ['storage.objects.list'])):
            self.fake.role = role
            self.rejects(self.run_completion, 'CUSTOM_ROLE_CONTRACT')
        self.assertEqual(self.fake.writes, [])

    def test_completion_requires_bucket_grantability_not_only_role_get(self):
        self.prepare_completion()
        self.fake.grantable_pages = [{'roles': [{'name': 'roles/storage.objectAdmin'}]}]
        self.rejects(self.run_completion, 'EXISTING_ROLE_NOT_GRANTABLE')
        self.assertEqual(self.fake.writes, [])
        self.assertFalse((self.directory / 'binding-completion-attempt.json').exists())

    def test_completion_paginates_fixed_bucket_grantability(self):
        self.prepare_completion()
        self.fake.grantable_pages = [{'roles': [{'name': 'roles/storage.objectViewer'}], 'nextPageToken': '1'},
                                     {'roles': [{'name': M.ROLE_NAME}]}]
        self.run_completion()
        queries = [x for x in self.fake.http_calls if x[1].endswith('roles:queryGrantableRoles')]
        self.assertEqual([x[2].get('pageToken') for x in queries], [None, '1', None, '1'])
        self.assertEqual(len(self.fake.writes), 1)

    def test_grantability_bad_pagination_or_rows_fail_closed(self):
        self.prepare_completion()
        for pages in ([{'roles': [{'name': M.ROLE_NAME}], 'nextPageToken': 123}],
                      [{'roles': [{'name': M.ROLE_NAME}] * 2}],
                      [{'nextPageToken': '1'}, {'nextPageToken': '1'}],
                      [{'roles': [None]}]):
            self.fake.grantable_pages = pages
            self.rejects(self.run_completion, 'GRANTABLE_ROLES_')
        self.assertEqual(self.fake.writes, [])

    def test_grantability_page_limit_stops_without_write(self):
        self.prepare_completion()
        self.fake.grantable_pages = [{'nextPageToken': str(i + 1)} for i in range(20)]
        self.rejects(self.run_completion, 'GRANTABLE_ROLES_PAGE_LIMIT')
        self.assertEqual(self.fake.writes, [])

    def test_grantability_denied_is_not_absence_or_automatic_retry(self):
        self.prepare_completion()
        def deny(method, url, body):
            if url.endswith('roles:queryGrantableRoles'):
                raise urllib.error.HTTPError(url, 403, TOKEN, {}, io.BytesIO(TOKEN.encode()))
        self.fake.hook = deny
        self.rejects(self.run_completion, 'HTTP_403')
        self.assertEqual(self.fake.writes, [])
        self.assertEqual(sum(x[1].endswith('roles:queryGrantableRoles') for x in self.fake.http_calls), 1)

    def test_completion_rechecks_grantability_before_write(self):
        self.prepare_completion()
        count = 0
        def hide_role(method, url, body):
            nonlocal count
            if url.endswith('roles:queryGrantableRoles'):
                count += 1
                if count == 2:
                    self.fake.grantable_pages = [{}]
        self.fake.hook = hide_role
        self.rejects(self.run_completion, 'EXISTING_ROLE_NOT_GRANTABLE')
        self.assertEqual(self.fake.writes, [])
        self.assertTrue((self.directory / 'binding-completion-attempt.json').exists())

    def test_completion_refuses_already_bound_or_unexpected_policy(self):
        self.prepare_completion()
        self.fake.policy.update(version=3, bindings=M.LEGACY + [M.BINDING])
        self.rejects(self.run_completion, 'POLICY_CHANGED_OR_UNEXPECTED')
        self.fake.policy['bindings'] = M.LEGACY + [{'role': 'roles/storage.admin', 'members': [M.MEMBER]}]
        self.rejects(self.run_completion, 'POLICY_CHANGED_OR_UNEXPECTED')
        self.assertEqual(self.fake.writes, [])

    def test_completion_prior_attempt_blocks_second_write_after_uncertain_put(self):
        self.prepare_completion()
        def lose_response(method, url, body):
            if method == 'PUT':
                raise OSError(TOKEN)
        self.fake.hook = lose_response
        self.rejects(self.run_completion, 'REQUEST_UNCONFIRMED')
        self.assertEqual(len(self.fake.writes), 1)
        self.fake.hook = None
        self.rejects(self.run_completion, 'PREVIOUS_MEDIA_IAM_ATTEMPT')
        self.assertEqual(len(self.fake.writes), 1)

    def test_completion_cas_conflict_and_redacted_error_metadata(self):
        self.prepare_completion()
        def race(method, url, body):
            if method == 'PUT':
                self.fake.policy['etag'] = 'changed'
        self.fake.hook = race
        self.rejects(self.run_completion, 'HTTP_412')
        self.assertEqual(len(self.fake.writes), 1)
        result = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertEqual(result['request_kind'], 'set-policy')
        self.assertEqual(result['recognized_reason'], 'UNCLASSIFIED')

    def test_completion_detects_role_and_project_drift_before_write(self):
        self.prepare_completion()
        def drift(method, url, body):
            if url.endswith('roles:queryGrantableRoles'):
                self.fake.role['etag'] = 'new-role-revision'
        self.fake.hook = drift
        self.rejects(self.run_completion, 'COMPLETION_PREFLIGHT_CHANGED')
        self.assertEqual(self.fake.writes, [])

    def test_completion_detects_broadened_condition_in_readback(self):
        self.prepare_completion()
        def alter_readback(method, url, body):
            if method == 'PUT':
                body['bindings'][-1]['condition']['expression'] = 'true'
        self.fake.hook = alter_readback
        self.rejects(self.run_completion, 'POLICY_CHANGED_OR_UNEXPECTED')
        self.assertEqual(len(self.fake.writes), 1)
        self.assertNotIn('COMPLETION_VERIFIED', self.output.getvalue())

    def test_completion_preserves_original_apply_role_exists_guard(self):
        self.prepare_completion()
        self.rejects(pattern='ALREADY_EXISTS_NO_ADOPTION_OR_RETRY')
        self.assertEqual(self.fake.writes, [])


if __name__ == '__main__':
    unittest.main()
