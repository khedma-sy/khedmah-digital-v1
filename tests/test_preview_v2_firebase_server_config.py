"""Offline failure/transport tests: no real credential, cloud write or network."""
import base64
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
import urllib.parse
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


M = load('server_config', ROOT / 'scripts/stage-preview-v2-firebase-server-config.py')
F = load('key_fixtures', ROOT / 'tests/test_preview_v2_firebase_server_key.py')
S = F.M
KEY = 'AIza' + 'x' * 35


class FakeCloud(F.FakeCloud):
    def __init__(self):
        super().__init__()
        self.keys.append(dict(F.server(), uid=M.KEY_UID))
        self.identities = {email: dict(name='projects/' + M.PROJECT + '/serviceAccounts/' + email,
            email=email, projectId=M.PROJECT, uniqueId=str(100000 + i))
            for i, email in enumerate(M.ACCOUNTS.values())}
        self.key_payload = KEY
        self.payload_reads = 0
        self.client = None

    def __call__(self, command, **options):
        args = command[1:4]
        if args in (['iam', 'service-accounts', 'describe'], ['services', 'api-keys', 'get-key-string']):
            self.calls.append((command, options))
            if args[0] == 'iam':
                value = self.identities[command[4]]
            else:
                assert command[4] == S.KEY_NAME
                self.payload_reads += 1
                value = {'keyString': self.key_payload}
        elif args[:2] == ['secrets', 'describe']:
            self.calls.append((command, options))
            value = self.client.secret
        elif args == ['secrets', 'versions', 'list']:
            self.calls.append((command, options))
            value = self.client.items
        elif args[:2] == ['secrets', 'get-iam-policy']:
            self.calls.append((command, options))
            value = self.client.policy
        else:
            return super().__call__(command, **options)
        return subprocess.CompletedProcess(command, 0, json.dumps(value).encode(), KEY.encode())


class FakeClient:
    def __init__(self, cloud):
        self.cloud = cloud
        cloud.client = self
        self.calls = []
        self.secret = dict(name=M.NAME, replication={'automatic': {}}, labels=M.LABELS,
                           etag='secret-etag', createTime='2026-10-14T08:30:00Z')
        self.policy = {'etag': 'empty-etag'}
        self.items = []
        self.data = None
        self.on_request = None

    def request(self, kind, payload=None, etag=None):
        self.calls.append((kind, payload, etag))
        if self.on_request:
            self.on_request(kind)
        if kind == 'create':
            self.cloud.secrets.append({'name': M.NAME})
            result = self.secret
        elif kind == 'secret':
            result = self.secret
        elif kind == 'policy':
            result = self.policy
        elif kind == 'versions':
            result = {'versions': self.items}
        elif kind == 'set-policy':
            assert etag == self.policy['etag']
            self.policy = {'etag': 'applied-etag', 'version': 1, 'bindings': copy.deepcopy(M.BINDINGS)}
            result = self.policy
        elif kind == 'add-version':
            self.data = payload
            self.items = [{'name': M.VERSION, 'state': 'ENABLED'}]
            result = dict(self.items[0], clientSpecifiedPayloadChecksum=True)
        elif kind == 'access':
            result = {'name': M.VERSION, 'payload': {'data': base64.b64encode(self.data).decode(),
                'dataCrc32c': str(M.crc32c(self.data))}}
        else:
            raise AssertionError(kind)
        return copy.deepcopy(result)


class ServerConfigTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / 'attempt'
        self.cloud = FakeCloud()
        self.client = FakeClient(self.cloud)
        self.output = io.StringIO()
        self.enterContext(patch.object(S.subprocess, 'run', self.cloud))
        self.enterContext(patch.object(M, 'Client', return_value=self.client))
        self.enterContext(patch.dict(os.environ, {}, clear=True))
        self.enterContext(contextlib.redirect_stdout(self.output))

    def run_helper(self, apply=True):
        M.run(apply=apply, source=S, directory=self.directory)

    def assert_stops(self, code):
        with self.assertRaisesRegex(SystemExit, code):
            self.run_helper()

    def mutations(self):
        return [x[0] for x in self.client.calls if x[0] in ('create', 'set-policy', 'add-version')]

    def test_success_one_value_exact_iam_and_no_payload_leaks(self):
        self.run_helper()
        self.assertEqual(self.mutations(), ['create', 'set-policy', 'add-version'])
        self.assertEqual(self.client.data, KEY.encode())
        self.assertEqual(self.cloud.payload_reads, 1)
        self.assertEqual(self.client.policy['bindings'], M.BINDINGS)
        self.assertNotIn(KEY, self.output.getvalue())
        self.assertNotIn(F.PRIVATE, self.output.getvalue())
        for command, options in self.cloud.calls:
            self.assertNotIn(KEY, repr(command) + repr(options.get('env')))
        files = list(self.directory.iterdir())
        self.assertEqual(len(files), 1)
        self.assertNotIn(KEY, files[0].read_text())
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
        receipt = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertTrue(receipt['value_verified'])
        for field in ('full_effective_iam_verified', 'runtime_secret_access_verified',
                      'runtime_binding_configured', 'application_deployed', 'login_flow_verified'):
            self.assertFalse(receipt[field])

    def test_inspect_absent_never_reads_credentials_or_marks_attempt(self):
        self.run_helper(False)
        self.assertEqual(self.client.calls, [])
        self.assertEqual(self.cloud.payload_reads, 0)
        self.assertFalse(self.directory.exists())
        self.assertFalse(any(c[0][1:3] == ['auth', 'print-access-token'] for c in self.cloud.calls))

    def test_inspect_partial_secret_without_payload_or_retry(self):
        self.cloud.secrets = [{'name': M.NAME}]
        self.run_helper(False)
        receipt = json.loads(self.output.getvalue())
        self.assertTrue(receipt['secret_container_present'])
        self.assertFalse(receipt['expected_direct_secret_bindings_present'])
        self.assertFalse(receipt['retry_authorized'])
        self.assertEqual(self.client.calls, [])

    def test_existing_secret_not_adopted_or_overwritten(self):
        self.cloud.secrets = [{'name': M.NAME}]
        self.assert_stops('ALREADY_EXISTS')
        self.assertEqual(self.mutations(), [])

    def test_wrong_server_uid_rejected(self):
        self.cloud.keys[-1]['uid'] = F.SERVER_UID
        self.assert_stops('IDENTITY_MISMATCH')
        self.assertEqual(self.mutations(), [])

    def test_browser_restrictions_not_weakened(self):
        self.cloud.keys[0]['restrictions']['browserKeyRestrictions']['allowedReferrers'] = ['https://*/*']
        self.assert_stops('BROWSER_RESTRICTIONS_CONFLICT')
        self.assertEqual(self.mutations(), [])

    def test_wrong_project_rejected_before_any_mutation(self):
        self.cloud.project['projectNumber'] = '123456789'
        self.assert_stops('PROJECT_IDENTITY_MISMATCH')
        self.assertEqual(self.mutations(), [])

    def test_disabled_or_foreign_service_account_rejected(self):
        email = M.ACCOUNTS['runtime']
        for field, value in (('disabled', True), ('projectId', 'foreign-project')):
            with self.subTest(field=field):
                old = copy.deepcopy(self.cloud.identities[email])
                self.cloud.identities[email][field] = value
                self.assert_stops('SERVICE_ACCOUNT_IDENTITY_UNCONFIRMED')
                self.cloud.identities[email] = old
        self.assertEqual(self.mutations(), [])

    def test_concurrent_key_change_before_create_stops(self):
        def changed(reads):
            if reads == 2:
                self.cloud.keys[-1]['etag'] = 'changed-etag'
        self.cloud.on_read = changed
        self.assert_stops('PREFLIGHT_CHANGED')
        self.assertEqual(self.mutations(), [])

    def test_uncertain_create_marker_blocks_retry_even_if_no_secret_visible(self):
        def fail(kind):
            if kind == 'create':
                M.stop('CREATE_UNCONFIRMED')
        self.client.on_request = fail
        self.assert_stops('CREATE_UNCONFIRMED')
        self.client.on_request = None
        self.assert_stops('PREVIOUS_STAGING_ATTEMPT')
        self.assertEqual(self.mutations(), ['create'])

    def test_initial_iam_conflict_stops_before_payload(self):
        self.client.policy['bindings'] = [{'role': 'roles/secretmanager.secretAccessor', 'members': ['allUsers']}]
        self.assert_stops('UNEXPECTED_DIRECT_SECRET_BINDINGS')
        self.assertEqual(self.cloud.payload_reads, 0)
        self.assertEqual(self.mutations(), ['create'])

    def test_iam_etag_failure_does_not_retry_or_stage(self):
        def fail(kind):
            if kind == 'set-policy':
                M.stop('HTTP_409_RECONCILE_NO_BLIND_RETRY')
        self.client.on_request = fail
        self.assert_stops('HTTP_409')
        self.assertEqual(self.cloud.payload_reads, 0)
        self.assertEqual(self.mutations(), ['create', 'set-policy'])

    def test_key_changed_after_iam_prevents_payload_read(self):
        def changed(kind):
            if kind == 'set-policy':
                self.cloud.keys[-1]['etag'] = 'changed-etag'
        self.client.on_request = changed
        self.assert_stops('KEY_OR_ACCOUNT_CHANGED_BEFORE_PAYLOAD_READ')
        self.assertEqual(self.cloud.payload_reads, 0)

    def test_invalid_key_never_staged_or_printed(self):
        self.cloud.key_payload = F.PRIVATE
        self.assert_stops('KEY_PAYLOAD_INVALID_NO_WRITE')
        self.assertNotIn('add-version', self.mutations())
        self.assertNotIn(F.PRIVATE, self.output.getvalue())

    def test_concurrent_version_writer_stops_before_our_add(self):
        reads = 0
        def changed(kind):
            nonlocal reads
            if kind == 'versions':
                reads += 1
                if reads == 2:
                    self.client.items = [{'name': M.VERSION, 'state': 'ENABLED'}]
        self.client.on_request = changed
        self.assert_stops('VERSION_INVENTORY_CONFLICT')
        self.assertNotIn('add-version', self.mutations())

    def test_uncertain_version_write_not_retried(self):
        def failed(kind):
            if kind == 'add-version':
                M.stop('ADD_VERSION_UNCONFIRMED')
        self.client.on_request = failed
        self.assert_stops('ADD_VERSION_UNCONFIRMED')
        self.assert_stops('ALREADY_EXISTS')
        self.assertEqual(self.mutations().count('add-version'), 1)

    def test_readback_value_mismatch_never_overwritten(self):
        def corrupt(kind):
            if kind == 'access':
                self.client.data = b'other-private-value'
        self.client.on_request = corrupt
        self.assert_stops('SECRET_VALUE_OR_CHECKSUM_MISMATCH')
        self.assertEqual(self.mutations().count('add-version'), 1)
        self.assertNotIn('other-private-value', self.output.getvalue())

    def test_policy_changed_after_write_prevents_success(self):
        def changed(kind):
            if kind == 'access':
                self.client.policy['bindings'][0]['members'].append('allAuthenticatedUsers')
        self.client.on_request = changed
        self.assert_stops('UNEXPECTED_DIRECT_SECRET_BINDINGS')
        self.assertNotIn('PREVIEW_V2_FIREBASE_SERVER_CONFIG_STAGED', self.output.getvalue())

    def test_nonprivate_marker_directory_rejected(self):
        self.directory.mkdir(mode=0o755)
        self.directory.chmod(0o755)
        self.assert_stops('ATTEMPT_DIRECTORY_NOT_PRIVATE')
        self.assertEqual(self.mutations(), [])


class TransportTest(unittest.TestCase):
    def test_crc32c_standard_vector(self):
        self.assertEqual(M.crc32c(b'123456789'), 0xe3069283)

    def test_fixed_endpoints_cas_and_private_body(self):
        client = M.Client('fake-token')
        calls = []
        class Response(io.BytesIO):
            pass
        def opened(request, **options):
            calls.append(request)
            return Response(b'{}')
        with patch.object(client.opener, 'open', side_effect=opened):
            client.request('create')
            client.request('set-policy', etag='observed-etag')
            client.request('add-version', payload=KEY.encode())
            client.request('access')
        for request in calls:
            self.assertTrue(request.full_url.startswith(M.ROOT))
            self.assertNotIn(KEY, request.full_url)
        body = json.loads(calls[1].data)
        self.assertEqual(body['policy']['etag'], 'observed-etag')
        self.assertEqual(body['policy']['bindings'], M.BINDINGS)
        self.assertEqual(body['updateMask'], 'bindings,etag')
        self.assertEqual(urllib.parse.urlsplit(calls[1].full_url).path, '/v1/' + M.NAME + ':setIamPolicy')
        payload = json.loads(calls[2].data)['payload']
        self.assertEqual(base64.b64decode(payload['data']), KEY.encode())
        self.assertEqual(int(payload['dataCrc32c']), M.crc32c(KEY.encode()))
        self.assertTrue(calls[3].full_url.startswith(M.ROOT + M.VERSION + ':access?'))

    def test_unknown_or_unscoped_mutation_rejected(self):
        client = M.Client('fake-token')
        for kind, kwargs in [('delete', {}), ('set-policy', {}), ('create', {'payload': b'x'}),
                             ('add-version', {'payload': b'invalid'}), ('access', {'etag': 'x'})]:
            with self.subTest(kind=kind), self.assertRaises(SystemExit), patch.object(client.opener, 'open') as opened:
                client.request(kind, **kwargs)
            opened.assert_not_called()

    def test_http_failure_sanitized_and_redirect_rejected(self):
        client = M.Client('fake-token')
        error = urllib.error.HTTPError(M.ROOT, 403, KEY, {}, io.BytesIO(KEY.encode()))
        with patch.object(client.opener, 'open', side_effect=error), self.assertRaises(SystemExit) as caught:
            client.request('add-version', payload=KEY.encode())
        self.assertNotIn(KEY, str(caught.exception))
        self.assertIn('HTTP_403', str(caught.exception))
        self.assertIsNone(M.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_source_hash_required_before_execution(self):
        data = (ROOT / 'scripts/create-preview-v2-firebase-server-key.py').read_bytes()
        value = dict(sha=M.SOURCE_BLOB, encoding='base64', size=len(data), content=base64.b64encode(data).decode())
        with patch.object(M.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(value).encode(), b'')):
            source = M.load_source()
            self.assertEqual(source.KEY_NAME, S.KEY_NAME)
        value['content'] = base64.b64encode(data + b'\n').decode()
        with patch.object(M.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(value).encode(), b'')), self.assertRaisesRegex(SystemExit, 'CHECKSUM_MISMATCH'):
            M.load_source()


if __name__ == '__main__':
    unittest.main()
