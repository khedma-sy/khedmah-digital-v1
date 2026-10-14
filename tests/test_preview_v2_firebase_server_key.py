"""Offline lifecycle/security tests; no real key, credentials or cloud calls."""
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

SPEC = importlib.util.spec_from_file_location('server_key', Path(__file__).resolve().parents[1]
    / 'scripts' / 'create-preview-v2-firebase-server-key.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
PRIVATE = 'private-fixture-value-must-never-appear'
SERVER_UID = '00000000-0000-4000-8000-000000000001'


def server():
    return dict(name=M.KEY_NAME, uid=SERVER_UID, displayName=M.DISPLAY_NAME, etag='server-etag',
                restrictions={'apiTargets': [{'service': M.SERVICE}]})


def browsers():
    return [dict(name=M.KEY_PARENT + '/keys/' + key_id, uid=uid, etag=key_id + '-etag',
                 restrictions={'apiTargets': [{'service': s} for s in sorted(services)],
                               'browserKeyRestrictions': {'allowedReferrers': sorted(refs)}})
        for key_id, uid, services, refs in (
            (M.BROWSER_ID, M.BROWSER_ID, M.BROWSER_SERVICES,
             {x + suffix for x in (M.ORIGIN, M.AUTH_ORIGIN) for suffix in ('', '/*')}),
            (M.MAPS_ID, M.MAPS_UID, {'maps-backend.googleapis.com'}, {M.ORIGIN + '/*'}))]


class FakeCloud:
    def __init__(self):
        self.keys = browsers()
        self.secrets = []
        self.calls = []
        self.project = dict(projectId=M.PROJECT, projectNumber=M.NUMBER, lifecycleState='ACTIVE',
                            parent={'type': 'organization', 'id': M.ORGANIZATION})
        self.services = [{'config': {'name': n}} for n in
                         ('apikeys.googleapis.com', M.SERVICE, 'secretmanager.googleapis.com')]
        self.reads = 0
        self.on_read = None

    def __call__(self, command, **options):
        self.calls.append((command, options))
        args = command[1:4]
        if args[:2] == ['config', 'get-value']:
            value = b'(unset)'
        elif args == ['config', 'list', 'api_endpoint_overrides/']:
            value = {}
        elif args[:2] == ['auth', 'list']:
            value = [{'account': M.ACCOUNT}]
        elif args[:2] == ['auth', 'print-access-token']:
            value = PRIVATE.encode()
        elif args[:2] == ['projects', 'describe']:
            value = self.project
        elif args[:2] == ['services', 'list']:
            value = self.services
        elif args == ['services', 'api-keys', 'list']:
            self.reads += 1
            if self.on_read:
                self.on_read(self.reads)
            value = self.keys
        elif args[:2] == ['secrets', 'list']:
            value = self.secrets
        else:
            raise AssertionError('Unexpected cloud operation: ' + repr(args))
        return subprocess.CompletedProcess(command, 0,
            value if isinstance(value, bytes) else json.dumps(value).encode(), PRIVATE.encode())


class FakeClient:
    def __init__(self, cloud):
        self.cloud = cloud
        self.calls = []
        self.fail_create = False
        self.key = server()

    def request(self, kind, operation=None):
        self.calls.append((kind, operation))
        if kind == 'create':
            if self.fail_create:
                M.stop('REQUEST_UNCONFIRMED_RECONCILE_NO_BLIND_RETRY')
            self.cloud.keys.append(copy.deepcopy(self.key))
            return {'name': 'operations/fixture-create', 'done': True}
        if kind == 'key':
            return copy.deepcopy(self.key)
        raise AssertionError('Unexpected request')


class ServerKeyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name) / 'attempt'
        self.cloud = FakeCloud()
        self.client = FakeClient(self.cloud)
        self.output, self.errors = io.StringIO(), io.StringIO()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(os.environ, {}, clear=True))
        self.stack.enter_context(patch.object(M.subprocess, 'run', side_effect=self.cloud))
        self.client_class = self.stack.enter_context(patch.object(M, 'Client', return_value=self.client))
        self.stack.enter_context(contextlib.redirect_stdout(self.output))
        self.stack.enter_context(contextlib.redirect_stderr(self.errors))

    def run_helper(self, apply=True):
        M.run(apply=apply, directory=self.directory)

    def test_create_preserves_browsers_and_never_reads_payloads(self):
        initial = copy.deepcopy(self.cloud.keys)
        self.run_helper()
        self.assertEqual(self.client.calls, [('create', None), ('key', None)])
        self.assertEqual(self.cloud.keys[:2], initial)
        receipt = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertEqual(receipt['stage'], 'PREVIEW_V2_FIREBASE_SERVER_KEY_CREATED')
        self.assertEqual(receipt['api_services'], [M.SERVICE])
        for key in ('secret_value_staged', 'iam_mutation', 'runtime_binding_configured',
                    'key_payload_access', 'secret_payload_access', 'application_deployed',
                    'floot_connected', 'client_restrictions_configured', 'login_flow_verified'):
            self.assertIs(receipt[key], False)
        self.assertNotIn(PRIVATE, self.output.getvalue() + self.errors.getvalue())
        marker = self.directory / 'create-attempt.json'
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o700)
        self.assertNotIn(PRIVATE, marker.read_text())
        for command, options in self.cloud.calls:
            self.assertIn('--project=' + M.PROJECT, command)
            self.assertIn('--account=' + M.ACCOUNT, command)
            self.assertNotIn(PRIVATE, repr(command))
            self.assertEqual(options['env']['CLOUDSDK_CORE_DISABLE_FILE_LOGGING'], 'true')

    def test_completed_creation_rejects_replay_before_token(self):
        self.cloud.keys.append(server())
        with self.assertRaisesRegex(SystemExit, 'ALREADY_PRESENT'):
            self.run_helper()
        self.client_class.assert_not_called()
        self.assertFalse(self.directory.exists())

    def test_existing_backend_secret_is_not_overwritten(self):
        self.cloud.secrets = [{'name': 'projects/' + M.NUMBER + '/secrets/' + M.SECRET}]
        with self.assertRaisesRegex(SystemExit, 'ALREADY_PRESENT'):
            self.run_helper()
        self.assertFalse(self.client.calls)

    def test_uncertain_create_is_never_blindly_repeated(self):
        self.client.fail_create = True
        with self.assertRaisesRegex(SystemExit, 'UNCONFIRMED'):
            self.run_helper()
        with self.assertRaisesRegex(SystemExit, 'PREVIOUS_CREATE_ATTEMPT'):
            self.run_helper()
        self.assertEqual(self.client.calls, [('create', None)])

    def test_inspect_absent_and_present_is_metadata_only(self):
        for present in (False, True):
            if present:
                self.cloud.keys.append(server())
            self.run_helper(apply=False)
            receipt = json.loads(self.output.getvalue().splitlines()[-1])
            self.assertEqual(receipt['server_key_present'], present)
            self.assertFalse(receipt['retry_authorized'])
        self.client_class.assert_not_called()
        self.assertFalse(self.directory.exists())

    def test_project_drift_stops_before_any_write(self):
        for key, value in (('projectId', 'khedma-dl'), ('projectNumber', '1'),
                           ('parent', {}), ('lifecycleState', 'DELETE_REQUESTED')):
            original = self.cloud.project[key]
            self.cloud.project[key] = value
            with self.assertRaisesRegex(SystemExit, 'PROJECT_IDENTITY'):
                self.run_helper()
            self.cloud.project[key] = original
        self.client_class.assert_not_called()

    def test_missing_api_does_not_enable_service(self):
        self.cloud.services.pop()
        with self.assertRaisesRegex(SystemExit, 'REQUIRED_API_NOT_ENABLED'):
            self.run_helper()
        self.assertFalse(self.client.calls)

    def test_auth_and_endpoint_overrides_are_rejected(self):
        for name in ('CLOUDSDK_AUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT',
                     'CLOUDSDK_API_ENDPOINT_OVERRIDES_APIKEYS'):
            with patch.dict(os.environ, {name: PRIVATE}):
                with self.assertRaises(SystemExit):
                    self.run_helper()
        self.assertFalse(self.cloud.calls)

    def test_existing_browser_restrictions_must_match(self):
        self.cloud.keys[0]['restrictions']['browserKeyRestrictions']['allowedReferrers'] = ['*']
        with self.assertRaisesRegex(SystemExit, 'EXISTING_BROWSER_RESTRICTIONS'):
            self.run_helper()
        self.assertFalse(self.client.calls)

    def test_extra_key_or_duplicate_inventory_stops(self):
        for value in (dict(server(), name=M.KEY_PARENT + '/keys/unreviewed'), self.cloud.keys[0]):
            self.cloud.keys = browsers() + [value]
            with self.assertRaises(SystemExit):
                self.run_helper()
        self.assertFalse(self.client.calls)

    def test_between_preflight_browser_drift_stops_before_post(self):
        def drift(count):
            if count == 2:
                self.cloud.keys[0]['etag'] = 'changed'
        self.cloud.on_read = drift
        with self.assertRaisesRegex(SystemExit, 'PREFLIGHT_CHANGED'):
            self.run_helper()
        self.assertFalse(self.client.calls)

    def test_post_create_browser_drift_has_no_success_receipt(self):
        def drift(count):
            if count == 3:
                self.cloud.keys[0]['etag'] = 'changed'
        self.cloud.on_read = drift
        with self.assertRaisesRegex(SystemExit, 'POST_CREATE_INVENTORY_CHANGED'):
            self.run_helper()
        self.assertNotIn('FIREBASE_SERVER_KEY_CREATED', self.output.getvalue())
        self.assertEqual(sum(k == 'create' for k, _ in self.client.calls), 1)

    def test_new_key_cannot_broaden_apis_or_claim_client_restrictions(self):
        for restrictions in ({}, {'apiTargets': [{'service': 'maps-backend.googleapis.com'}]},
                             {'apiTargets': [{'service': M.SERVICE, 'methods': ['*']}]},
                             {'apiTargets': [{'service': M.SERVICE}], 'browserKeyRestrictions': {}}):
            with self.assertRaises(SystemExit):
                M.validate_server(dict(server(), restrictions=restrictions))

    def test_uid_readback_mismatch_is_unconfirmed(self):
        def drift(count):
            if count == 3:
                self.cloud.keys[-1]['uid'] = '00000000-0000-4000-8000-000000000002'
        self.cloud.on_read = drift
        with self.assertRaisesRegex(SystemExit, 'POST_CREATE_INVENTORY_CHANGED'):
            self.run_helper()

    def test_attempt_directory_symlink_or_public_permissions_rejected(self):
        self.directory.symlink_to(Path(self.tmp.name), target_is_directory=True)
        with self.assertRaisesRegex(SystemExit, 'DIRECTORY_REJECTED'):
            self.run_helper()
        self.directory.unlink()
        self.directory.mkdir()
        self.directory.chmod(0o755)
        with self.assertRaisesRegex(SystemExit, 'DIRECTORY_NOT_PRIVATE'):
            self.run_helper()
        self.assertFalse(self.client.calls)

    def test_cloud_failure_suppresses_captured_credentials(self):
        with patch.object(M.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1,
                          PRIVATE.encode(), PRIVATE.encode())):
            with self.assertRaisesRegex(SystemExit, 'METADATA_READ_FAILED'):
                M.cloud('auth', 'print-access-token')
        self.assertNotIn(PRIVATE, self.output.getvalue() + self.errors.getvalue())


class HttpBoundaryTest(unittest.TestCase):
    def test_fixed_create_request_has_restrictions_and_masks_operation_response(self):
        client = M.Client(PRIVATE)
        response = io.BytesIO(b'{"name":"operations/fixture","done":true}')
        with patch.object(client.opener, 'open', return_value=response) as opened:
            client.request('create')
        request = opened.call_args.args[0]
        url = urllib.parse.urlsplit(request.full_url)
        self.assertEqual(url.netloc, 'apikeys.googleapis.com')
        self.assertEqual(url.path, '/v2/' + M.KEY_PARENT + '/keys')
        self.assertEqual(urllib.parse.parse_qs(url.query), {'keyId': [M.KEY_ID], 'fields': [M.OP_FIELDS]})
        self.assertEqual(request.method, 'POST')
        self.assertEqual(json.loads(request.data), {'displayName': M.DISPLAY_NAME,
            'restrictions': {'apiTargets': [{'service': M.SERVICE}]}})
        self.assertNotIn(PRIVATE, request.full_url)
        self.assertNotIn('response', M.OP_FIELDS)

    def test_unapproved_endpoint_or_operation_never_reaches_network(self):
        client = M.Client(PRIVATE)
        with patch.object(client.opener, 'open') as opened:
            for kind, op in (('getKeyString', None), ('delete', None), ('key', 'operations/x'),
                             ('operation', '../keys/x'), ('operation', 'https://other.example')):
                with self.assertRaisesRegex(SystemExit, 'SCOPE_REJECTED'):
                    client.request(kind, operation=op)
            opened.assert_not_called()

    def test_http_error_and_timeout_do_not_leak_response(self):
        client = M.Client(PRIVATE)
        for error in (urllib.error.HTTPError('https://example.invalid', 403, PRIVATE, {},
                                             io.BytesIO(PRIVATE.encode())), OSError(PRIVATE)):
            with patch.object(client.opener, 'open', side_effect=error):
                with self.assertRaises(SystemExit) as failure:
                    client.request('create')
                self.assertNotIn(PRIVATE, str(failure.exception))

    def test_pending_operation_stops_without_second_create(self):
        with patch.object(M.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            from unittest.mock import Mock
            client = Mock()
            result = {'name': 'operations/fixture', 'done': False}
            client.request.return_value = result
            with self.assertRaisesRegex(SystemExit, 'PENDING_RECONCILE'):
                M.wait_operation(client, result)
            self.assertEqual(client.request.call_count, 29)
            self.assertTrue(all(c.args[0] == 'operation' for c in client.request.call_args_list))

    def test_operation_errors_and_conflicting_names_are_not_success(self):
        with contextlib.redirect_stdout(io.StringIO()):
            for result in ({'name': 'operations/x', 'done': True, 'error': {'code': 7}},
                           {'name': 'operations/x', 'done': 'true'}, {'name': '../wrong'}):
                with self.assertRaises(SystemExit):
                    M.wait_operation(None, result)

    def test_redirects_are_rejected(self):
        self.assertIsNone(M.NoRedirect().redirect_request(None, None, None, None, None, None))


if __name__ == '__main__':
    unittest.main()
