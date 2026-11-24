import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'scripts/diagnose-lab-secret-binding-failure.py'
spec = importlib.util.spec_from_file_location('lab_diag', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DiagnosticTests(unittest.TestCase):
    def test_recent_failures_for_all_three_secrets_remain_redacted(self):
        for kind, secret in m.SECRETS.items():
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                p = Path(directory) / 'failure.log'
                p.write_text('gcloud.secrets.add-iam-policy-binding ' + m.PROJECT + ' ' + secret +
                             '\nERROR: INVALID_ARGUMENT: Service account ' + m.PRINCIPAL +
                             ' does not exist. sentinel-private-data')
                result = m.scan_logs(Path(directory))
                self.assertEqual(result['LOG_STATUS'], 'RECENT_MATCH')
                self.assertEqual(result['LOG_SECRET_KIND'], kind)
                self.assertTrue(result['EXACT_PRINCIPAL_MISSING'])
                self.assertTrue(result['INVALID_ARGUMENT'])
                self.assertNotIn('sentinel-private-data', json.dumps(result))
                self.assertNotIn(m.PRINCIPAL, json.dumps(result))


    def test_pinned_runner_retry_shape_is_classified_without_exposing_log(self):
        principal = m.PRINCIPAL
        standard = ('ERROR: (gcloud.secrets.add-iam-policy-binding) '
                    'INVALID_ARGUMENT: Service account [' + principal + '] does not exist.')
        nonstandard = standard + ' Further details available.'
        self.assertTrue(m.pinned_runner_retry_match(standard))
        self.assertFalse(m.pinned_runner_retry_match(nonstandard))
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'failure.log'
            p.write_text('gcloud.secrets.add-iam-policy-binding ' + m.SECRETS['SQL'] +
                         '\n' + nonstandard + ' sentinel-private-data')
            status = m.scan_logs(Path(directory))
            self.assertEqual(status['LOG_STATUS'], 'RECENT_MATCH')
            self.assertTrue(status['EXACT_PRINCIPAL_MISSING'])
            self.assertTrue(status['INVALID_ARGUMENT'])
            self.assertTrue(status['GCLOUD_BIND_ERROR_PREFIX_PRESENT'])
            self.assertFalse(status['PINNED_RUNNER_RETRY_PATTERN_MATCH'])
            self.assertNotIn('sentinel-private-data', json.dumps(status))
            self.assertNotIn(principal, json.dumps(status))

    def test_old_failure_is_not_presented_as_current(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'failure.log'
            p.write_text('gcloud.secrets.add-iam-policy-binding ' + m.SECRETS['SQL'] + '\nERROR: PERMISSION_DENIED')
            old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).timestamp()
            os.utime(p, (old, old))
            result = m.scan_logs(Path(directory))
            self.assertEqual(result['LOG_STATUS'], 'STALE_OR_CLOCK_UNVERIFIED')
            self.assertNotIn('PERMISSION_DENIED', result)

    def test_cloud_queries_are_explicit_lab_reads_and_match_cleanup(self):
        calls = []
        def run(command, **kwargs):
            calls.append(command)
            self.assertEqual(command[:3], ['gcloud', '--quiet', '--project=' + m.PROJECT])
            args = command[3:-1]
            if args[:3] == ['sql', 'instances', 'describe']:
                obj = {'project': m.PROJECT, 'name': m.INSTANCE, 'state': 'STOPPED', 'settings': {'activationPolicy': 'NEVER'}}
            elif args == ['secrets', 'list']:
                obj = [{'name': 'projects/42/secrets/other'}]
            elif args == ['iam', 'service-accounts', 'list']:
                obj = [{'email': 'other@example.invalid'}]
            elif args == ['run', 'jobs', 'list', '--region=' + m.REGION]:
                obj = []
            else:
                self.fail('unexpected or mutating command')
            return type('Result', (), {'returncode': 0, 'stderr': '', 'stdout': json.dumps(obj)})()
        with patch.object(m.subprocess, 'run', side_effect=run):
            result = m.inspect_cloud()
        self.assertEqual(result['LAB_ACTIVATION_POLICY'], 'NEVER')
        self.assertFalse(result['TEMP_SECRETS_PRESENT'])
        self.assertFalse(result['TEMP_SERVICE_ACCOUNT_PRESENT'])
        self.assertFalse(result['TEMP_TRANSITION_JOB_PRESENT'])
        self.assertEqual(len(calls), 4)

    def test_failed_or_incomplete_inventory_is_unknown(self):
        with patch.object(m, 'read_cloud', side_effect=[None, None, [{}], [{'metadata': {}}]]):
            result = m.inspect_cloud()
        self.assertEqual(result['LAB_ACTIVATION_POLICY'], 'UNKNOWN')
        self.assertEqual(result['TEMP_SECRETS_PRESENT'], 'UNKNOWN')
        self.assertEqual(result['TEMP_SERVICE_ACCOUNT_PRESENT'], 'UNKNOWN')
        self.assertEqual(result['TEMP_TRANSITION_JOB_PRESENT'], 'UNKNOWN')

    def test_main_does_not_print_raw_log(self):
        with tempfile.TemporaryDirectory() as directory:
            logs = Path(directory) / 'logs'
            logs.mkdir()
            (logs / 'failure.log').write_text('gcloud.secrets.add-iam-policy-binding ' + m.SECRETS['PASSWORD'] + '\nERROR: PERMISSION_DENIED sentinel-private-data')
            output = io.StringIO()
            with patch.dict(os.environ, {'CLOUDSDK_CONFIG': directory}), patch.object(m, 'inspect_cloud', return_value={}), contextlib.redirect_stdout(output):
                m.main()
            self.assertIn('PERMISSION_DENIED: True', output.getvalue())
            self.assertNotIn('sentinel-private-data', output.getvalue())


if __name__ == '__main__':
    unittest.main()
