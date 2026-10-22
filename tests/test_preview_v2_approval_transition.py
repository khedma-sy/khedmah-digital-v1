"""Offline assembly/CLI tests; native transaction behavior has its own PG16 fixture."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import runpy
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/prepare-preview-v2-approval-transition.py'
spec = importlib.util.spec_from_file_location('approval_transition', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SOURCES = {key: (ROOT / pin[0]).read_bytes() for key, pin in m.SOURCE_PINS.items()}


class TransitionTests(unittest.TestCase):
    def setUp(self):
        for owner, name in ((subprocess, 'run'), (subprocess, 'Popen'), (socket, 'create_connection')):
            guard = patch.object(owner, name, side_effect=AssertionError('EXTERNAL_ACCESS_FORBIDDEN'))
            guard.start()
            self.addCleanup(guard.stop)

    def test_each_unmodified_source_matches_both_independent_pins(self):
        self.assertEqual(set(m.verified_sources(SOURCES)), {'runner', '025', '036', '037'})
        for name in SOURCES:
            changed = dict(SOURCES, **{name: SOURCES[name] + b'\n'})
            with self.subTest(source=name), self.assertRaisesRegex(SystemExit, 'SOURCE_BYTES_MISMATCH'):
                m.build_transition_sql(changed)

    def test_missing_extra_and_nonbyte_inputs_are_rejected(self):
        for changed in ({}, {**SOURCES, '035': b'not authorized'}, None):
            with self.subTest(changed=type(changed)), self.assertRaisesRegex(SystemExit, 'SOURCE_SET_MISMATCH'):
                m.build_transition_sql(changed)
        with self.assertRaisesRegex(SystemExit, 'SOURCE_BYTES_MISMATCH'):
            m.build_transition_sql({**SOURCES, '036': SOURCES['036'].decode()})

    def test_body_substitution_retains_every_other_canonical_predicate(self):
        before, after, text = m.catalog_ctes(SOURCES)
        old = text['025'].split('CREATE FUNCTION enforce_ad_free_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$', 1)[1].split('$$;', 1)[0]
        new = text['036'].split('CREATE OR REPLACE FUNCTION enforce_ad_free_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$', 1)[1].split('$$;', 1)[0]
        self.assertEqual(hashlib.sha256(old.encode()).hexdigest(), m.BODY_025_SHA256)
        self.assertEqual(hashlib.sha256(new.encode()).hexdigest(), m.BODY_036_SHA256)
        self.assertEqual(before.replace('AND p.prosrc=$quota$' + old + '$quota$',
                                       'AND p.prosrc=$quota$' + new + '$quota$', 1), after)
        self.assertNotIn('AD_DAILY_QUOTA_EXHAUSTED', before)
        self.assertNotIn('AD_FREE_QUOTA_EXHAUSTED', after)

    def test_atomic_candidate_contains_only_the_two_unchanged_migrations(self):
        sql = m.build_transition_sql(SOURCES)
        for name in ('036', '037'):
            self.assertEqual(sql.count('EXECUTE $migration' + name + '$' + SOURCES[name].decode()
                                       + '$migration' + name + '$;'), 1)
        self.assertEqual(sql.count('\nCOMMIT;'), 1)
        self.assertNotIn('EXECUTE $migration035$', sql)
        self.assertNotIn('GRANT ', sql)
        self.assertNotIn('INSERT INTO ', sql)
        self.assertLess(sql.index('LOCK TABLE public.ad_free_slots'), sql.index("SELECT classification='role-target'"))
        self.assertLess(sql.index("SELECT classification='target'"), sql.index('\nCOMMIT;'))

    def test_plan_is_explicitly_offline_and_excludes_runnable_sql(self):
        plan = m.prepare_plan(SOURCES)
        self.assertEqual(plan['migrations'], ['036', '037'])
        self.assertEqual(plan['role_035_action'], 'preserve_exact_target')
        for name in ('execution_enabled', 'cloud_access_performed', 'database_access_performed',
                     'schema_mutation', 'role_mutation', 'acl_mutation', 'application_data_mutation',
                     'application_row_values_returned', 'application_deployment_performed',
                     'schema_readiness_verified', 'release_gates_verified'):
            self.assertIs(plan[name], False, name)
        self.assertIs(plan['constraint_validation_scans_existing_rows'], True)
        self.assertIs(plan['successor_startup_requires_037'], True)
        self.assertIn('classifieds_maintenance_all_routes_traffic_tags_and_inflight_drained', plan['required_live_gates'])
        self.assertIn('governed_ddl_exclusion', plan['required_live_gates'])
        self.assertEqual(plan['transaction_sql_sha256'], hashlib.sha256(m.build_transition_sql(SOURCES).encode()).hexdigest())
        self.assertNotIn('CREATE OR REPLACE', json.dumps(plan))
        self.assertNotIn('BEGIN ISOLATION', json.dumps(plan))

    def test_plan_cli_emits_only_json_without_external_access(self):
        out = io.StringIO()
        with patch.object(sys, 'argv', [str(SCRIPT), '--plan']), contextlib.redirect_stdout(out):
            runpy.run_path(str(SCRIPT), run_name='__main__')
        self.assertEqual(json.loads(out.getvalue()), m.prepare_plan(SOURCES))

    def test_cli_rejects_apply_sql_output_target_overrides_and_duplicates(self):
        for argv in ([], ['--apply'], ['--print-sql'], ['--plan', '--apply'],
                     ['--plan', '--project=khedma-dl'], ['--plan', '--plan']):
            out = io.StringIO()
            with self.subTest(argv=argv), contextlib.redirect_stdout(out):
                with self.assertRaisesRegex(SystemExit, '^STOP: USE_OFFLINE_PLAN_ONLY$'):
                    m.main(argv)
                self.assertEqual(out.getvalue(), '')

    def test_missing_file_failure_does_not_leak_local_error(self):
        with patch.object(Path, 'read_bytes', side_effect=OSError('sensitive synthetic value')):
            with self.assertRaisesRegex(SystemExit, '^STOP: OFFLINE_TRANSITION_SOURCE_UNAVAILABLE$'):
                m.main(['--plan'])


if __name__ == '__main__':
    if sys.argv[1:] == ['--sql-lab-pack']:
        # Test-only transport: consumed exclusively by the disposable Docker
        # fixture. The operator CLI intentionally has no SQL-output mode.
        print(json.dumps({'transition': m.build_transition_sql(SOURCES)}))
    else:
        unittest.main()
