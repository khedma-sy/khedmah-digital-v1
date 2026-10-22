"""Offline approval-catalog tests. No cloud command, socket or database is used."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/read-preview-v2-approval-schema.py'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


m = module('approval_schema_read', SCRIPT)
r = module('approval_frozen_reader_fixture', ROOT / 'scripts/read-preview-v2-schema.py')
READER_BYTES = (ROOT / 'scripts/read-preview-v2-schema.py').read_bytes()
RUNNER_BYTES = (ROOT / 'scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh').read_bytes()
PASSWORD = 'ab' * 32
TOKEN = 'synthetic-approval-catalog-token'
CTE_SHA256 = '78484298abedabcd657966015940039c8ed8cf66a79c3061871a699eec9f7c47'


def blob_id(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def blob_response(data, **changes):
    return dict(sha=blob_id(data), size=len(data), encoding='base64',
                content=base64.b64encode(data).decode(), **changes)


def catalog(classification='target'):
    value = dict(database='khedmah', user='khedmah_migrator', session_user='khedmah_migrator',
                 read_only='on', isolation='repeatable read', server_version_num=160012,
                 classification=classification, required_relation_anchors=True,
                 role_column_exact=True, quota_columns_exact=True, media_columns_exact=True,
                 role_predecessor=False, role_target=True, asset_predecessor=False, asset_target=True,
                 private_constraint_absent=False, private_constraint_target=True, quota_target=True)
    if classification in ('predecessor', 'role-target'):
        value.update(asset_predecessor=True, asset_target=False,
                     private_constraint_absent=True, private_constraint_target=False)
        if classification == 'predecessor':
            value.update(role_predecessor=True, role_target=False)
    elif classification == 'prerequisite-invalid':
        value['quota_target'] = False
    elif classification == 'invalid':
        value['role_column_exact'] = False
    return value


def instance():
    return dict(name=r.INSTANCE, project=r.PROJECT, region=r.REGION, connectionName=r.CONNECTION,
                state='RUNNABLE', databaseVersion='POSTGRES_16')


class OfflineCase(unittest.TestCase):
    def setUp(self):
        # Any forgotten fixture fails locally instead of falling through to a tool.
        for owner, name in ((subprocess, 'run'), (subprocess, 'Popen'), (r.urllib.request, 'build_opener')):
            guard = patch.object(owner, name, side_effect=AssertionError('UNMOCKED_EXTERNAL_ACCESS'))
            guard.start()
            self.addCleanup(guard.stop)

    def assert_redacted(self, text):
        self.assertNotIn(PASSWORD, text)
        self.assertNotIn(TOKEN, text)


class SourceTests(OfflineCase):
    def test_both_exact_pins_load_as_private_reader_and_catalog_data_only(self):
        sources = {m.READER_BLOB: READER_BYTES, m.RUNNER_BLOB: RUNNER_BYTES}
        self.assertEqual(blob_id(READER_BYTES), m.READER_BLOB)
        self.assertEqual(hashlib.sha256(READER_BYTES).hexdigest(), m.READER_SHA256)
        self.assertEqual(blob_id(RUNNER_BYTES), m.RUNNER_BLOB)
        self.assertEqual(hashlib.sha256(RUNNER_BYTES).hexdigest(), m.RUNNER_SHA256)

        def run(args, **kwargs):
            self.assertEqual(args[:4], ['gh', 'api', '--hostname', 'github.com'])
            blob = args[-1].rsplit('/', 1)[-1]
            self.assertEqual(args[-1], 'repos/' + m.REPO + '/git/blobs/' + blob)
            self.assertNotIn('GH_DEBUG', kwargs['env'])
            self.assertNotIn('DEBUG', kwargs['env'])
            self.assertTrue(kwargs['capture_output'])
            self.assertEqual(kwargs['timeout'], 60)
            return subprocess.CompletedProcess(args, 0, json.dumps(blob_response(sources[blob])).encode(), b'')

        with tempfile.TemporaryDirectory() as directory, patch.object(m.subprocess, 'run', side_effect=run) as calls:
            with patch.dict(os.environ, {'GH_DEBUG': 'api', 'DEBUG': 'all'}, clear=True):
                reader, sql = m.load_sources(Path(directory))
            path = Path(directory) / 'pinned_reader.py'
            self.assertEqual(path.read_bytes(), READER_BYTES)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(reader.CONNECTION, r.CONNECTION)
            self.assertEqual(sql, m.build_sql(RUNNER_BYTES))
            self.assertEqual(calls.call_count, 2)

    def test_bad_metadata_bytes_checksums_and_bounded_responses_fail_closed(self):
        good = blob_response(READER_BYTES)
        cases = [dict(returncode=1, stdout=PASSWORD.encode()),
                 dict(stdout=b'x' * 262145), dict(stdout=(TOKEN + '{').encode()),
                 dict(payload=[]), dict(payload=None)]
        for change in ({'sha': '0' * 40}, {'encoding': 'utf8'}, {'content': '!bad-base64!'},
                       {'content': None}, {'content': 123}, {'size': len(READER_BYTES) + 1},
                       {'size': str(len(READER_BYTES))}, {'size': -1},
                       {'content': base64.b64encode(READER_BYTES + b'\n').decode()}):
            cases.append(dict(payload={**good, **change}))
        for case in cases:
            with self.subTest(case=case.keys()):
                raw = case.get('stdout', json.dumps(case.get('payload', good)).encode())
                with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], case.get('returncode', 0), raw, TOKEN.encode())) as calls:
                    with self.assertRaises(SystemExit) as error:
                        m.fetch_blob(m.READER_BLOB, m.READER_SHA256)
                self.assert_redacted(str(error.exception))
                self.assertEqual(calls.call_count, 1)
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(good).encode(), b'')):
            with self.assertRaisesRegex(SystemExit, 'PINNED_SOURCE_BYTES_MISMATCH'):
                m.fetch_blob(m.READER_BLOB, '0' * 64)

    def test_tampered_source_is_rejected_before_module_import(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(m, 'fetch_blob', side_effect=[READER_BYTES, RUNNER_BYTES + b'\n']):
                with patch.object(m.importlib.util, 'spec_from_file_location') as importer:
                    with self.assertRaisesRegex(SystemExit, 'RUNNER_CHECKSUM_MISMATCH'):
                        m.load_sources(Path(directory))
                    importer.assert_not_called()
                    self.assertFalse((Path(directory) / 'pinned_reader.py').exists())

    def test_canonical_cte_is_byte_exact_with_read_only_wrapper_and_no_shell_branch(self):
        sql = m.build_sql(RUNNER_BYTES)
        cte = re.search(r'(?ms)^WITH attributes AS \(.*?(?=^SELECT pg_catalog\.json_build_object\()', sql)
        self.assertIsNotNone(cte)
        self.assertEqual(len(cte.group().encode()), 9659)
        self.assertEqual(hashlib.sha256(cte.group().encode()).hexdigest(), CTE_SHA256)
        self.assertTrue(sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;\n'))
        self.assertTrue(sql.endswith('ROLLBACK;\n'))
        # Quota function text is compared as data, not executed or returned.
        executable = re.sub(r'(?s)\$([A-Za-z_]\w*|)\$.*?\$\1\$', '', sql)
        self.assertNotRegex(executable, r'(?im)^\s*(?:COMMIT|ALTER|CREATE|GRANT|REVOKE|INSERT|UPDATE|DELETE|COPY|LOCK)\b')
        self.assertNotRegex(executable, r'(?im)^\s*\\')
        self.assertNotRegex(executable, r'(?i)\bFROM\s+(?:public\.|ad_free_slots\b|media_assets\b|admin_roles\b)')
        self.assertNotIn('rolpassword', sql)
        self.assertNotIn('pg_authid', sql)
        for guard in ("session_user<>'khedmah_migrator'", "current_database()<>'khedmah'",
                      "current_setting('transaction_read_only')<>'on'", 'rolbypassrls'):
            self.assertIn(guard, sql)

    def test_cte_boundaries_reject_missing_duplicate_or_reversed_markers(self):
        source = RUNNER_BYTES.decode()
        variants = (source.replace(m.CTE_START, '', 1), source + m.CTE_START,
                    source.replace(m.CTE_END, '', 1), m.CTE_END + '\n' + m.CTE_START)
        for text in variants:
            data = text.encode()
            with self.subTest(length=len(data)), patch.object(m, 'RUNNER_SHA256', hashlib.sha256(data).hexdigest()):
                with self.assertRaisesRegex(SystemExit, 'CATALOG_CTE_BOUNDARY_MISMATCH'):
                    m.build_sql(data)


class ResultTests(OfflineCase):
    def test_supported_classifications_and_boolean_observations_are_retained(self):
        for state in ('prerequisite-invalid', 'invalid', 'predecessor', 'role-target', 'target'):
            value = catalog(state)
            self.assertEqual(m.validate_result(value), value)

    def test_identity_isolation_version_and_response_shape_are_strict(self):
        for change in ({'database': 'other'}, {'user': 'postgres'}, {'session_user': 'postgres'},
                       {'read_only': 'off'}, {'isolation': 'read committed'},
                       {'server_version_num': 159999}, {'server_version_num': 170000},
                       {'server_version_num': True}, {'server_version_num': '160012'},
                       {'classification': 'ready'}, {'classification': None}, {'extra': PASSWORD}):
            with self.subTest(change=change.keys()), self.assertRaisesRegex(SystemExit, 'APPROVAL_CATALOG_RESPONSE_INVALID') as error:
                m.validate_result({**catalog(), **change})
            self.assert_redacted(str(error.exception))
        for value in (None, [], {}, {key: value for key, value in catalog().items() if key != 'session_user'}):
            with self.assertRaises(SystemExit):
                m.validate_result(value)

    def test_every_catalog_flag_requires_a_real_boolean(self):
        for name in m.FLAGS:
            for value in (0, 1, 'true', None, []):
                with self.subTest(flag=name, value=value), self.assertRaises(SystemExit):
                    m.validate_result({**catalog(), name: value})


class CatalogTests(OfflineCase):
    def invoke(self, output=None, returncode=0, error=None):
        sql = m.build_sql(RUNNER_BYTES)
        with tempfile.TemporaryDirectory(prefix='approval-\\:') as directory:
            work = Path(directory)

            def run(args, **kwargs):
                path = work / 'approval.pgpass'
                socket_dir = str(work / r.CONNECTION)
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                escaped = socket_dir.replace('\\', '\\\\').replace(':', '\\:')
                self.assertEqual(path.read_text(), escaped + ':5432:khedmah:khedmah_migrator:' + PASSWORD + '\n')
                self.assertEqual(args, ['psql', '-X', '-w', '-q', '-A', '-t', '-h', socket_dir,
                    '-p', '5432', '-U', r.USER, '-d', r.DATABASE, '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'])
                self.assertNotIn(PASSWORD, ' '.join(args))
                self.assertNotIn(TOKEN, ' '.join(args))
                self.assertEqual(kwargs['input'], sql)
                self.assertEqual(kwargs['timeout'], 60)
                self.assertEqual(kwargs['stdout'], subprocess.PIPE)
                self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
                self.assertTrue(kwargs['text'])
                self.assertFalse(kwargs.get('shell', False))
                env = kwargs['env']
                self.assertEqual(set(env), {'KEEP', 'PGPASSFILE', 'PGCONNECT_TIMEOUT', 'PGSSLMODE', 'PGOPTIONS'})
                self.assertEqual(env['PGPASSFILE'], str(path))
                self.assertEqual(env['PGCONNECT_TIMEOUT'], '10')
                self.assertEqual(env['PGSSLMODE'], 'disable')
                for option in ('role=none', 'search_path=pg_catalog', 'default_transaction_read_only=on',
                               'statement_timeout=30000', 'lock_timeout=5000'):
                    self.assertIn('-c ' + option, env['PGOPTIONS'])
                self.assertNotIn(PASSWORD, repr(env))
                self.assertNotIn(TOKEN, repr(env))
                if error:
                    raise error
                return subprocess.CompletedProcess(args, returncode, json.dumps(catalog()) if output is None else output, PASSWORD)

            overrides = {name: TOKEN for name in ('PGPASSWORD', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER',
                'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGOPTIONS', 'PGSSLMODE',
                'CSQL_PROXY_INSTANCES', 'CSQL_PROXY_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS')}
            overrides['KEEP'] = 'value'
            out, err = io.StringIO(), io.StringIO()
            with patch.dict(os.environ, overrides, clear=True), patch.object(m.subprocess, 'run', side_effect=run) as calls:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    try:
                        return m.read_catalog(r, work, PASSWORD, sql)
                    finally:
                        self.assertEqual(calls.call_count, 1)
                        self.assertFalse((work / 'approval.pgpass').exists())
                        self.assertEqual(out.getvalue() + err.getvalue(), '')

    def test_read_only_socket_routing_private_passfile_and_override_stripping(self):
        self.assertEqual(self.invoke(), catalog())

    def test_failed_oversize_malformed_and_unexpected_output_is_redacted_without_retry(self):
        for kwargs in (dict(returncode=1, output=PASSWORD), dict(output='x' * 16385),
                       dict(output=TOKEN + '{bad-json'), dict(output='null'),
                       dict(output=json.dumps({**catalog(), 'extra': PASSWORD}))):
            with self.subTest(case=kwargs.keys()), self.assertRaises(SystemExit) as error:
                self.invoke(**kwargs)
            self.assert_redacted(str(error.exception))

    def test_timeout_and_process_error_still_remove_the_passfile(self):
        for error in (subprocess.TimeoutExpired('psql', 60, output=TOKEN, stderr=PASSWORD), OSError('synthetic failure')):
            with self.subTest(type=type(error)), self.assertRaises(type(error)):
                self.invoke(error=error)

    def test_bad_password_or_existing_passfile_never_starts_psql(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(m.subprocess, 'run') as run:
            work = Path(directory)
            for password in ('bad', PASSWORD + '\n', PASSWORD.upper()):
                with self.assertRaisesRegex(SystemExit, 'PASSWORD_FORMAT_REJECTED'):
                    m.read_catalog(r, work, password, m.build_sql(RUNNER_BYTES))
            self.assertEqual(list(work.iterdir()), [])
            path = work / 'approval.pgpass'
            path.write_text('existing-file')
            with self.assertRaises(FileExistsError):
                m.read_catalog(r, work, PASSWORD, m.build_sql(RUNNER_BYTES))
            self.assertEqual(path.read_text(), 'existing-file')
            run.assert_not_called()


class InspectionTests(OfflineCase):
    def inspect_mocked(self, preflight_error=None, target=None, version=None, tools=True,
                       proxy_state='ready', read_error=None, cleanup_error=None, token=TOKEN.encode()):
        reader = Mock(spec=r)
        for name in ('CONNECTION', 'PROJECT', 'INSTANCE', 'SECRET', 'RESOURCE', 'DATABASE', 'USER'):
            setattr(reader, name, getattr(r, name))
        reader.preflight.side_effect = preflight_error
        reader.validate_instance.side_effect = r.validate_instance
        reader.cloud.side_effect = [instance() if target is None else target,
            {'name': r.RESOURCE, 'state': 'ENABLED'} if version is None else version, token]
        reader.read_password.return_value = PASSWORD
        reader.proxy_environment.side_effect = r.proxy_environment
        reader.stop_proxy.side_effect = cleanup_error if cleanup_error is not None else r.stop_proxy
        proxy, works = Mock(), []
        proxy.poll.return_value = 1 if proxy_state == 'exited' else None

        def load(work):
            works.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode), 0o700)
            return reader, m.build_sql(RUNNER_BYTES)

        def popen(args, **kwargs):
            work = works[0]
            self.assertEqual(args, ['cloud-sql-proxy', r.CONNECTION, '--unix-socket=' + str(work)])
            self.assertNotIn(TOKEN, ' '.join(args))
            self.assertEqual(kwargs['stderr'], subprocess.STDOUT)
            self.assertEqual(kwargs['env'], {'CSQL_PROXY_TOKEN': TOKEN})
            self.assertEqual(stat.S_IMODE((work / 'proxy.log').stat().st_mode), 0o600)
            kwargs['stdout'].write(TOKEN + '\n' + PASSWORD)
            if proxy_state == 'start-error':
                raise OSError(TOKEN)
            if proxy_state in ('ready', 'bad-socket'):
                (work / r.CONNECTION).mkdir()
                # Match the existing offline pattern: no real socket is created.
                (work / r.CONNECTION / '.s.PGSQL.5432').touch()
            return proxy

        out = io.StringIO()
        self.reader, self.proxy, self.output = reader, proxy, ''
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, {}, clear=True))
            stack.enter_context(patch.object(m.shutil, 'which', return_value='/fake' if tools else None))
            sources = stack.enter_context(patch.object(m, 'load_sources', side_effect=load))
            process = stack.enter_context(patch.object(m.subprocess, 'Popen', side_effect=popen))
            read = stack.enter_context(patch.object(m, 'read_catalog', return_value=catalog(), side_effect=read_error))
            stack.enter_context(patch.object(m.stat, 'S_ISSOCK', return_value=proxy_state == 'ready'))
            stack.enter_context(patch.object(m.time, 'monotonic', side_effect=[0, 46]))
            stack.enter_context(patch.object(m.time, 'sleep'))
            stack.enter_context(contextlib.redirect_stdout(out))
            self.sources, self.process, self.read = sources, process, read
            try:
                m.inspect()
                return json.loads(out.getvalue())
            finally:
                self.output = out.getvalue()
                self.assert_redacted(self.output)
                for work in works:
                    self.assertFalse(work.exists())

    def test_target_receipt_stays_sanitized_with_all_readiness_and_mutation_gates_false(self):
        value = self.inspect_mocked()
        self.assertEqual(value['stage'], 'PREVIEW_V2_APPROVAL_SCHEMA_CATALOG_READ_COMPLETED')
        self.assertEqual((value['project'], value['instance'], value['database']), (r.PROJECT, r.INSTANCE, r.DATABASE))
        self.assertEqual(value['catalog'], catalog('target'))
        self.assertEqual(value['inspection_sql_sha256'], hashlib.sha256(m.build_sql(RUNNER_BYTES).encode()).hexdigest())
        self.assertEqual(value['reader_git_blob'], m.READER_BLOB)
        self.assertEqual(value['runner_sha256'], m.RUNNER_SHA256)
        self.assertEqual(value['migration_secret_version'], '1')
        self.assertTrue(value['secret_payload_access'])
        for flag in ('credential_values_printed', 'application_data_rows_read', 'cloud_resource_mutation',
                     'schema_mutation', 'role_mutation', 'application_data_mutation', 'schema_readiness_verified',
                     'release_gates_verified', 'application_deployment_performed'):
            self.assertIs(value[flag], False)
        self.assertEqual(self.sources.call_count, 1)
        self.reader.preflight.assert_called_once_with()
        self.reader.read_password.assert_called_once_with(TOKEN)
        self.reader.stop_proxy.assert_called_once_with(self.proxy)
        self.proxy.terminate.assert_called_once()
        self.assertEqual(self.read.call_count, 1)
        self.assertNotIn('definition', self.output)
        self.assertNotIn('prosrc', self.output)

    def test_missing_tools_or_failed_preflight_stops_before_target_credentials_or_proxy(self):
        for options in (dict(tools=False), dict(preflight_error=SystemExit('STOP: EXPECTED_ACCOUNT_NOT_AVAILABLE'))):
            with self.subTest(options=options.keys()), self.assertRaises(SystemExit):
                self.inspect_mocked(**options)
            self.reader.cloud.assert_not_called()
            self.reader.read_password.assert_not_called()
            self.process.assert_not_called()
            self.read.assert_not_called()
            self.assertEqual(self.output, '')
            if not options.get('tools', True):
                self.sources.assert_not_called()

    def test_wrong_instance_or_secret_version_never_reads_a_credential_or_starts_proxy(self):
        cases = [dict(target={**instance(), key: value}) for key, value in (
            ('project', 'foreign'), ('connectionName', 'foreign:region:db'),
            ('name', 'foreign'), ('state', 'PENDING'), ('databaseVersion', 'POSTGRES_15'))]
        cases += [dict(version=value) for value in ({'name': r.RESOURCE, 'state': 'DISABLED'},
            {'name': r.RESOURCE.replace('/1', '/2'), 'state': 'ENABLED'},
            {'name': r.RESOURCE, 'state': 'ENABLED', 'unexpected': True})]
        for options in cases:
            with self.subTest(options=options.keys()), self.assertRaises(SystemExit):
                self.inspect_mocked(**options)
            self.reader.read_password.assert_not_called()
            self.assertFalse(any(call.args[:2] == ('auth', 'print-access-token') for call in self.reader.cloud.call_args_list))
            self.process.assert_not_called()
            self.read.assert_not_called()
            self.assertEqual(self.output, '')

    def test_empty_or_whitespace_token_stops_before_payload_and_proxy(self):
        for token in (b'', b'bad token'):
            with self.assertRaisesRegex(SystemExit, 'TOKEN_UNAVAILABLE'):
                self.inspect_mocked(token=token)
            self.reader.read_password.assert_not_called()
            self.process.assert_not_called()

    def test_proxy_exit_timeout_and_non_socket_never_read_catalog_and_cleanup(self):
        for state in ('exited', 'timeout', 'bad-socket'):
            with self.subTest(state=state), self.assertRaisesRegex(SystemExit, 'PRIVATE_SQL_PROXY_'):
                self.inspect_mocked(proxy_state=state)
            self.read.assert_not_called()
            self.reader.stop_proxy.assert_called_once_with(self.proxy)
            self.assertEqual(self.output, '')

    def test_start_catalog_and_cleanup_failures_never_emit_success_and_remove_workspace(self):
        for options, error in ((dict(proxy_state='start-error'), OSError),
                               (dict(read_error=SystemExit('STOP: READ_FAILED')), SystemExit),
                               (dict(cleanup_error=OSError(TOKEN)), OSError)):
            with self.subTest(options=options.keys()), self.assertRaises(error):
                self.inspect_mocked(**options)
            self.assertEqual(self.output, '')
            self.assertEqual(self.reader.stop_proxy.call_count, 1)
            self.assertLessEqual(self.read.call_count, 1)


class CliTests(OfflineCase):
    def run_main(self, args, failure=None):
        out, err = io.StringIO(), io.StringIO()
        previous_umask = os.umask(0o077)
        try:
            with patch.object(sys, 'argv', [str(SCRIPT), *args]), patch.object(m.shutil, 'which', return_value='/fake'):
                with patch.object(m.subprocess, 'run', side_effect=failure) as run, patch.object(m.subprocess, 'Popen') as proxy:
                    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                        with self.assertRaises(SystemExit) as stopped:
                            runpy.run_path(str(SCRIPT), run_name='__main__')
                    proxy.assert_not_called()
                    self.assertEqual(out.getvalue() + err.getvalue(), '')
                    self.assert_redacted(str(stopped.exception))
                    return str(stopped.exception), run.call_count
        finally:
            os.umask(previous_umask)

    def test_only_exact_inspect_argument_is_accepted_without_cloud_access(self):
        for args in ([], ['--apply'], ['--inspect', '--apply'], ['--inspect', '--project=foreign']):
            code, count = self.run_main(args)
            self.assertIn('USE_INSPECT_ONLY', code)
            self.assertEqual(count, 0)

    def test_cli_redacts_raw_process_errors_timeouts_and_interrupts(self):
        for failure in (OSError(TOKEN), subprocess.TimeoutExpired(TOKEN, 60, output=PASSWORD), KeyboardInterrupt(TOKEN)):
            code, count = self.run_main(['--inspect'], failure)
            self.assertEqual(code, 'STOP: LOCAL_OR_APPROVAL_CATALOG_READ_FAILURE')
            self.assertEqual(count, 1)


if __name__ == '__main__':
    unittest.main()
