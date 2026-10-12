"""Offline regressions: no real Google endpoint or database is contacted."""
import base64
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup', Path(__file__).resolve().parents[1] / 'scripts/configure-preview-v2-database.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def project():
    return {'projectId': m.PROJECT, 'projectNumber': m.NUMBER, 'lifecycleState': 'ACTIVE',
            'parent': {'type': 'organization', 'id': m.ORGANIZATION}}


def instance():
    return {'name': m.INSTANCE, 'project': m.PROJECT, 'region': m.REGION,
            'connectionName': m.CONNECTION, 'state': 'RUNNABLE', 'databaseVersion': 'POSTGRES_16',
            'settings': {'connectorEnforcement': 'REQUIRED', 'ipConfiguration': {'authorizedNetworks': []}}}


def empty():
    return {'database': 'khedmah', 'user': 'postgres', 'relations': 0, 'routines': 0, 'schemas': 0, 'roles': 0}


def roles():
    return {'database': 'khedmah', 'roles': [
        {'name': name, 'login': name in m.USERS, 'super': False, 'createdb': False,
         'createrole': False, 'replication': False, 'bypassrls': False}
        for name in [*m.USERS, *m.USERS.values()]],
        'memberships': [{'member': u, 'role': r, 'admin': False, 'inherit': True, 'set': True}
                        for u, r in m.USERS.items()],
        'runtime_connect': True, 'runtime_create': False, 'runtime_temp': False,
        'runtime_schema_create': False, 'migration_create': True, 'migration_schema_create': True}


class FakeRunner(m.Runner):
    def __init__(self):
        super().__init__()
        self.events = []
        self.payloads = {}

    def cloud(self, *args):
        if args[:3] == ('secrets', 'versions', 'list'): return '[]'
        if args[:3] == ('secrets', 'versions', 'describe'):
            name = next(x.split('=', 1)[1] for x in args if x.startswith('--secret='))
            return json.dumps({'name': f'projects/{m.NUMBER}/secrets/{name}/versions/1', 'state': 'ENABLED'})
        raise AssertionError(args)

    def preflight(self):
        self.events.append('preflight')
        self.token = 'TEST_OAUTH_MUST_NOT_APPEAR'

    def start_proxy(self):
        self.events.append('proxy')

    def set_postgres_password(self):
        self.events.append('postgres_password')

    def sql(self, user, statement):
        self.events.append(('sql', user, statement))
        if m.EMPTY_SQL in statement: return json.dumps(empty())
        if statement == m.ROLE_CHECK_SQL: return json.dumps(roles())
        if statement in (m.MIGRATOR_SQL, m.RUNTIME_SQL):
            return json.dumps({'database': m.DATABASE, 'user': user, 'probe_absent': True})
        return ''

    def request(self, method, url, body=None):
        assert m.allowed_request(method, url), (method, url)
        self.events.append((method, url, body))
        if url.endswith('/users'):
            assert body['databaseRoles'] == [m.USERS[body['name']]]
            return {'name': 'test-operation', 'targetId': m.INSTANCE, 'targetProject': m.PROJECT,
                    'status': 'DONE', 'operationType': 'CREATE_USER'}
        if url.endswith(':addVersion'):
            resource = url.split('/v1/', 1)[1].split(':', 1)[0] + '/versions/1'
            self.payloads[resource] = body['payload']['data']
            return {'name': resource, 'state': 'ENABLED'}
        if url.endswith(':access'):
            resource = url.split('/v1/', 1)[1].split(':', 1)[0]
            return {'name': resource, 'payload': {'data': self.payloads[resource]}}
        raise AssertionError(url)


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_exact_target_allowed(self):
        m.validate_target(project(), instance())

    def test_foreign_identity_or_nonready_instance_rejected(self):
        for key, value in [('project', 'khedma-dl'), ('region', 'us-central1'), ('state', 'PENDING_CREATE'),
                           ('connectionName', 'other:europe-west1:db'), ('databaseVersion', 'POSTGRES_15')]:
            with self.subTest(key=key):
                x = instance(); x[key] = value
                with self.assertRaises(m.Stop): m.validate_target(project(), x)
        x = project(); x['projectNumber'] = '311026134906'
        with self.assertRaises(m.Stop): m.validate_target(x, instance())

    def test_direct_network_configuration_rejected(self):
        for change in ({'connectorEnforcement': 'NOT_REQUIRED'},
                       {'ipConfiguration': {'authorizedNetworks': [{'value': '0.0.0.0/0'}]}}):
            x = instance(); x['settings'].update(change)
            with self.assertRaises(m.Stop): m.validate_target(project(), x)

    def test_nonempty_database_or_existing_roles_rejected(self):
        m.validate_empty(empty())
        for key in ('relations', 'routines', 'schemas', 'roles'):
            x = empty(); x[key] = 1
            with self.assertRaises(m.Stop): m.validate_empty(x)

    def test_privileged_roles_rejected(self):
        m.validate_roles(roles())
        for key in ('super', 'createdb', 'createrole', 'replication', 'bypassrls'):
            x = roles(); x['roles'][0][key] = True
            with self.assertRaisesRegex(m.Stop, 'ROLE_PRIVILEGED'): m.validate_roles(x)

    def test_role_inheritance_escalation_rejected(self):
        for role in ('cloudsqlsuperuser', 'khedmah_migration_role'):
            x = roles(); x['memberships'][0]['role'] = role
            with self.assertRaises(m.Stop): m.validate_roles(x)
        x = roles(); x['memberships'][0]['admin'] = True
        with self.assertRaises(m.Stop): m.validate_roles(x)
        x = roles(); x['memberships'].append({'member': 'khedmah_runtime_role', 'role': 'cloudsqlsuperuser'})
        with self.assertRaises(m.Stop): m.validate_roles(x)

    def test_runtime_ddl_and_temp_rejected(self):
        for key in ('runtime_create', 'runtime_temp', 'runtime_schema_create'):
            x = roles(); x[key] = True
            with self.assertRaises(m.Stop): m.validate_roles(x)

    def test_credential_format_and_fixed_socket_compatible_url(self):
        self.assertEqual(m.credential_url('khedmah_app', 'a' * 64),
                         'postgresql://khedmah_app:' + 'a' * 64 + '@localhost/khedmah')
        for user, password in [('postgres', 'a' * 64), ('khedmah_app', "bad';SQL"), ('khedmah_app', 'short')]:
            with self.assertRaises(m.Stop): m.credential_url(user, password)

    def test_only_fixed_endpoints_allowed(self):
        self.assertTrue(m.allowed_request('POST', m.SQL_BASE + f'/instances/{m.INSTANCE}/users'))
        for method, url in [('DELETE', m.SQL_BASE + f'/instances/{m.INSTANCE}/users'),
                            ('PUT', m.SQL_BASE + f'/instances/{m.INSTANCE}/users?name=khedmah_app'),
                            ('GET', m.SM_BASE + 'RESEND_API_KEY/versions/1:access'),
                            ('GET', m.SM_BASE.replace(m.NUMBER, '311026134906') + 'DATABASE_URL/versions/1:access'),
                            ('GET', m.SQL_BASE + '/operations/../../other')]:
            self.assertFalse(m.allowed_request(method, url))

    def test_redirects_refused(self):
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_endpoint_override_rejected(self):
        with patch.dict(os.environ, {'CLOUDSDK_API_ENDPOINT_OVERRIDES_SQL': 'https://foreign.invalid'}):
            with self.assertRaises(m.Stop): m.Runner()

    def test_default_mode_never_initializes_cloud_runner(self):
        with patch.object(m.sys, 'argv', ['setup']), patch.object(m, 'Runner') as runner, patch('builtins.print'):
            m.main(); runner.assert_not_called()

    def test_wrong_operation_target_rejected(self):
        r = m.Runner()
        with self.assertRaises(m.Stop):
            r.operation({'name': 'op', 'targetProject': 'khedma-dl', 'targetId': m.INSTANCE,
                         'operationType': 'CREATE_USER', 'status': 'DONE'}, 'CREATE_USER')

    def test_failed_operation_not_retried(self):
        r = m.Runner()
        with patch.object(r, 'request') as request:
            with self.assertRaises(m.Stop):
                r.operation({'name': 'op', 'targetProject': m.PROJECT, 'targetId': m.INSTANCE,
                             'operationType': 'CREATE_USER', 'status': 'DONE', 'error': {'errors': [{}]}}, 'CREATE_USER')
            request.assert_not_called()

    def test_pending_journal_blocks_before_preflight(self):
        with tempfile.TemporaryDirectory() as home, patch.object(m.Path, 'home', return_value=Path(home)):
            root = Path(home) / 'khedmah-preview-v2-database-runs'; root.mkdir(); (root / 'run-old').mkdir()
            r = FakeRunner()
            try:
                with self.assertRaisesRegex(m.Stop, 'PREVIOUS_DATABASE_RUN'): r.apply()
                self.assertEqual(r.events, [])
            finally: r.close()

    def test_batch_order_private_journal_and_no_output_secrets(self):
        with tempfile.TemporaryDirectory() as home, patch.object(m.Path, 'home', return_value=Path(home)), \
             patch('sys.stdout', new_callable=io.StringIO) as output:
            r = FakeRunner()
            try:
                r.apply()
                self.assertEqual(r.events.count('postgres_password'), 2)
                first_publish = next(i for i, x in enumerate(r.events) if isinstance(x, tuple)
                                     and x[0] == 'POST' and x[1].endswith(':addVersion'))
                for statement in (m.MIGRATOR_SQL, m.RUNTIME_SQL):
                    self.assertLess(next(i for i, x in enumerate(r.events) if isinstance(x, tuple)
                                         and x[0] == 'sql' and x[2] == statement), first_publish)
                self.assertEqual(r.versions, {'DATABASE_URL': '1', 'DATABASE_MIGRATION_URL': '1'})
                self.assertEqual((r.work / 'recovery.json').stat().st_mode & 0o777, 0o600)
                self.assertEqual(r.work.stat().st_mode & 0o777, 0o700)
                self.assertNotIn(r.token, output.getvalue())
                for password in r.passwords.values(): self.assertNotIn(password, output.getvalue())
                self.assertIn('PREVIEW_V2_DATABASE_IDENTITIES_VERIFIED_SCHEMA_PENDING', output.getvalue())
            finally: r.close()

    def test_bad_role_proof_stops_before_secret_publication(self):
        class BadRoles(FakeRunner):
            def sql(self, user, statement):
                if statement == m.ROLE_CHECK_SQL:
                    x = roles(); x['roles'][0]['createrole'] = True; return json.dumps(x)
                return super().sql(user, statement)
        with tempfile.TemporaryDirectory() as home, patch.object(m.Path, 'home', return_value=Path(home)), patch('builtins.print'):
            r = BadRoles()
            try:
                with self.assertRaisesRegex(m.Stop, 'ROLE_PRIVILEGED'): r.apply()
                self.assertFalse(r.payloads)
                self.assertTrue((r.work / 'recovery.json').is_file())
            finally: r.close()

    def test_secret_response_cannot_redirect_payload_read(self):
        r = FakeRunner()
        with tempfile.TemporaryDirectory() as folder, patch('builtins.print'):
            r.work = Path(folder); r.passwords = {'khedmah_app': 'a' * 64}
            with patch.object(r, 'request', return_value={'name': 'projects/311026134906/secrets/DATABASE_URL/versions/1',
                                                        'state': 'ENABLED'}) as request:
                with self.assertRaises(m.Stop): r.publish('DATABASE_URL', 'khedmah_app')
                self.assertEqual(request.call_count, 1)

    def test_populated_secret_rejected_without_write(self):
        r = FakeRunner()
        with patch.object(r, 'cloud', return_value='[{"name":"existing"}]'), patch.object(r, 'request') as request:
            with self.assertRaises(m.Stop): r.publish('DATABASE_URL', 'khedmah_app')
            request.assert_not_called()

    def test_password_and_token_not_passed_in_psql_arguments(self):
        with tempfile.TemporaryDirectory() as folder:
            r = m.Runner(); r.work = Path(folder); r.passwords = {'khedmah_app': 'b' * 64}
            r.env['PGHOST'] = 'foreign.invalid'; r.env['PGSERVICE'] = 'foreign'
            with patch.object(m.subprocess, 'run') as run:
                run.return_value.returncode = 0; run.return_value.stdout = '{}'
                r.sql('khedmah_app', 'SELECT 1;')
                args, kwargs = run.call_args
                self.assertNotIn('b' * 64, repr(args))
                self.assertNotIn('PGHOST', kwargs['env']); self.assertNotIn('PGSERVICE', kwargs['env'])
                self.assertEqual((r.work / 'pgpass').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
