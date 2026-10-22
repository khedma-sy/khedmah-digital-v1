"""Offline release-metadata fixtures; no cloud, network, token or SQL access."""
import base64
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/read-preview-v2-approval-release.py'
spec = importlib.util.spec_from_file_location('approval_release_reader_test', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
READER = (ROOT / 'scripts/read-preview-v2-schema.py').read_bytes()
FEDERATION = (ROOT / 'scripts/configure-preview-v2-github.py').read_bytes()
REFERENCE = m.federation_reference(FEDERATION)
SENTINEL = 'PRIVATE_PAYLOAD_MUST_NEVER_APPEAR_7d80f9'
OTHER_REVISION = m.SERVICE + '-00009-test'


def spec_fixture():
    return dict(serviceAccountName=m.IDENTITIES['runtime'], timeoutSeconds=300, containers=[dict(env=[
        dict(name='DATABASE_URL', valueFrom=dict(secretKeyRef=dict(name='DATABASE_URL', key='1'))),
        dict(name='CLOUD_SQL_INSTANCE_CONNECTION_NAME', value=m.CONNECTION),
        dict(name='CLASSIFIEDS_ENABLED', value='true'),
        dict(name='OTHER_PRIVATE_VALUE', value=SENTINEL),
        dict(name='OPERATIONS_PRODUCT_ROLE_BINDINGS', valueFrom=dict(secretKeyRef=dict(
            name='OPERATIONS_PRODUCT_ROLE_BINDINGS', key='latest')))])])


def service_fixture():
    return dict(metadata=dict(name=m.SERVICE, namespace=m.NUMBER, generation=8,
                              labels={'cloud.googleapis.com/location': m.REGION}),
                spec=dict(template=dict(metadata=dict(annotations={'run.googleapis.com/cloudsql-instances': m.CONNECTION}),
                                        spec=spec_fixture())),
                status=dict(observedGeneration=8, conditions=[dict(type='Ready', status='True', message=SENTINEL)],
                            latestCreatedRevisionName=m.KNOWN_REVISION, latestReadyRevisionName=m.KNOWN_REVISION,
                            traffic=[dict(revisionName=m.KNOWN_REVISION, percent=100)]))


def revision_fixture(name=m.KNOWN_REVISION):
    return dict(metadata=dict(name=name, namespace=m.NUMBER,
                labels={'serving.knative.dev/service': m.SERVICE, 'cloud.googleapis.com/location': m.REGION},
                annotations={'run.googleapis.com/cloudsql-instances': m.CONNECTION}),
                spec=spec_fixture(), status=dict(conditions=[dict(type='Ready', status='True')]))


def environment_fixture(custom=False):
    return dict(name='preview', can_admins_bypass=False,
                deployment_branch_policy=dict(protected_branches=not custom, custom_branch_policies=custom,
                                              ignored_extra=SENTINEL),
                protection_rules=[dict(type='required_reviewers', prevent_self_review=True,
                    reviewers=[dict(type='User', reviewer=dict(id=123, login=SENTINEL))]),
                    dict(type='wait_timer', wait_timer=5)], ignored_extra=SENTINEL)


class ReaderFixture:
    def __init__(self):
        self.preflight = Mock()
        self.calls = []
        self.service = service_fixture()
        self.service_after = None
        self.revisions = {m.KNOWN_REVISION: revision_fixture(), OTHER_REVISION: revision_fixture(OTHER_REVISION)}
        self.overrides = {}
        self.unavailable = set()

    def cloud(self, *args, fields=None):
        self.preflight.assert_called_once_with()
        self.calls.append((args, fields))
        if args in self.unavailable:
            raise SystemExit('STOP: GCLOUD_' + '_'.join(args[:3]).upper().replace('-', '_') + '_FAILED_RECONCILE')
        if args in self.overrides:
            return copy.deepcopy(self.overrides[args])
        if args == m.SERVICE_ARGS:
            count = sum(a == args for a, _ in self.calls)
            return copy.deepcopy(self.service_after if count > 1 and self.service_after is not None else self.service)
        if args[:3] == ('run', 'revisions', 'describe'):
            return copy.deepcopy(self.revisions[args[3]])
        if args[:3] == ('sql', 'instances', 'describe'):
            return dict(name=m.INSTANCE, project=m.PROJECT, region=m.REGION, connectionName=m.CONNECTION,
                        state='RUNNABLE', databaseVersion='POSTGRES_16')
        if args[:3] == ('iam', 'service-accounts', 'describe'):
            return dict(name=f'projects/{m.PROJECT}/serviceAccounts/{args[3]}', email=args[3],
                        projectId=m.PROJECT, uniqueId='12345678901', disabled=False)
        if args[:3] == ('secrets', 'versions', 'describe'):
            name = args[4].split('=', 1)[1]
            return dict(name=f'projects/{m.NUMBER}/secrets/{name}/versions/1', state='ENABLED')
        if args[:3] == ('iam', 'workload-identity-pools', 'describe'):
            return dict(name=m.POOL_NAME, state='ACTIVE', disabled=False)
        if args[:4] == ('iam', 'workload-identity-pools', 'providers', 'describe'):
            return dict(name=m.PROVIDER_NAME, state='ACTIVE', disabled=False, attributeMapping=REFERENCE['mapping'],
                        attributeCondition=REFERENCE['condition'], oidc=dict(issuerUri='https://token.actions.githubusercontent.com'))
        if args[:3] == ('iam', 'service-accounts', 'get-iam-policy'):
            if args[3] != m.IDENTITIES['deployer']:
                return dict(version=1, bindings=[dict(role='roles/iam.serviceAccountUser',
                    members=['serviceAccount:' + m.IDENTITIES['deployer']])])
            return dict(version=1, bindings=[dict(role='roles/iam.workloadIdentityUser', members=[m.WIF_MEMBER])])
        if args[:2] == ('projects', 'get-iam-policy'):
            return dict(version=3, bindings=[
                dict(role='roles/run.admin', members=['serviceAccount:' + m.IDENTITIES['deployer']]),
                dict(role='roles/cloudsql.client', members=['serviceAccount:' + m.IDENTITIES['runtime']],
                     condition=dict(title=SENTINEL, expression=SENTINEL)),
                dict(role='roles/owner', members=['user:' + m.ACCOUNT]),
                dict(role='roles/viewer', members=['user:' + SENTINEL])])
        raise AssertionError('UNEXPECTED_CLOUD_COMMAND')


class OfflineCase(unittest.TestCase):
    def setUp(self):
        for name in ('run', 'Popen'):
            guard = patch.object(subprocess, name, side_effect=AssertionError('UNMOCKED_EXTERNAL_ACCESS'))
            guard.start()
            self.addCleanup(guard.stop)

    def collect(self, reader=None, environment=None):
        fixture = reader or ReaderFixture()
        with patch.object(m, 'gh_json', return_value=environment or environment_fixture()) as github:
            result = m.collect(fixture, REFERENCE)
        self.assertNotIn(SENTINEL, json.dumps(result))
        return result, fixture, github


class SourceAndBoundaryTests(OfflineCase):
    def test_pinned_sources_load_reader_privately_but_federation_is_inert(self):
        sources = {m.READER_BLOB: READER, m.FEDERATION_BLOB: FEDERATION}
        for blob, checksum, source in ((m.READER_BLOB, m.READER_SHA256, READER),
                                       (m.FEDERATION_BLOB, m.FEDERATION_SHA256, FEDERATION)):
            self.assertEqual(hashlib.sha256(source).hexdigest(), checksum)
            self.assertEqual(hashlib.sha1(b'blob ' + str(len(source)).encode() + b'\0' + source).hexdigest(), blob)
        with tempfile.TemporaryDirectory() as directory, patch.object(m, 'fetch_blob', side_effect=lambda blob, _: sources[blob]), \
                patch.object(m.importlib.util, 'spec_from_file_location', wraps=m.importlib.util.spec_from_file_location) as imports:
            reader, reference = m.load_sources(Path(directory))
            self.assertEqual(reader.PROJECT, m.PROJECT)
            self.assertEqual(reference['condition'], REFERENCE['condition'])
            self.assertIn("assertion.ref == 'refs/pull/274/merge'", reference['condition'])
            self.assertEqual(imports.call_count, 1)
            self.assertEqual(Path(imports.call_args.args[1]).name, 'pinned_reader.py')
            self.assertEqual(stat.S_IMODE((Path(directory) / 'pinned_reader.py').stat().st_mode), 0o600)
        self.assertFalse(Path(directory).exists())

    def test_tampered_sources_fail_before_import(self):
        for sources in ((READER + b'\n', FEDERATION), (READER, FEDERATION + b'\n')):
            with self.subTest(which=sources[0] == READER), tempfile.TemporaryDirectory() as directory, \
                    patch.object(m, 'fetch_blob', side_effect=sources), patch.object(m.importlib.util, 'spec_from_file_location') as imports:
                with self.assertRaisesRegex(SystemExit, 'PINNED_SOURCE_BYTES_MISMATCH'):
                    m.load_sources(Path(directory))
                imports.assert_not_called()

    def test_gh_fetch_is_get_only_and_verifies_bytes_without_debug_output(self):
        payload = dict(sha=m.READER_BLOB, size=len(READER), encoding='base64', content=base64.b64encode(READER).decode())
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(payload).encode(), SENTINEL.encode())) as run, \
                patch.dict(os.environ, {'GH_DEBUG': 'api', 'DEBUG': 'all'}):
            self.assertEqual(m.fetch_blob(m.READER_BLOB, m.READER_SHA256), READER)
            self.assertEqual(run.call_args.args[0][:6], ['gh', 'api', '--hostname', 'github.com', '--method', 'GET'])
            self.assertNotIn('GH_DEBUG', run.call_args.kwargs['env'])
            self.assertNotIn('DEBUG', run.call_args.kwargs['env'])
            with self.assertRaisesRegex(SystemExit, 'GITHUB_READ_SCOPE_REJECTED'):
                m.gh_json('repos/' + m.REPO + '/actions/workflows/preview-deployment.yml/dispatches')
            self.assertEqual(run.call_count, 1)

    def test_read_failure_and_bad_json_never_emit_payload_or_error_body(self):
        for returncode, raw, optional in ((1, SENTINEL.encode(), False), (0, SENTINEL.encode(), True),
                                          (0, b'null', True), (0, b'[]', True),
                                          (0, b'x' * (m.MAX_RESPONSE + 1), False)):
            with self.subTest(returncode=returncode, optional=optional), \
                    patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], returncode, raw, SENTINEL.encode())):
                with self.assertRaises(SystemExit) as exc:
                    m.gh_json(m.ENVIRONMENT_PATH, optional=optional)
                self.assertNotIn(SENTINEL, str(exc.exception))
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, SENTINEL.encode(), SENTINEL.encode())):
            self.assertIsNone(m.gh_json(m.ENVIRONMENT_PATH, optional=True))

    def test_wrong_cli_flags_stop_before_any_io(self):
        for args in ([], ['--apply'], ['--help'], ['--inspect', '--project=khedma-dl'], ['--inspect-quota']):
            with self.subTest(args=args), patch.object(m, 'inspect') as inspect, patch.object(m.os, 'umask') as umask:
                with self.assertRaisesRegex(SystemExit, 'USE_INSPECT_ONLY'):
                    m.main(args)
                inspect.assert_not_called()
                umask.assert_not_called()

    def test_mutation_and_secret_payload_commands_are_rejected_before_transport(self):
        reader = ReaderFixture()
        for command in (('run', 'services', 'update', m.SERVICE), ('secrets', 'versions', 'access', '1'),
                        ('auth', 'print-access-token'), ('builds', 'submit'), ('run', 'jobs', 'execute', 'job'),
                        ('config', 'set', 'project', m.PROJECT), ('projects', 'get-iam-policy', 'khedma-dl'),
                        ('run', 'revisions', 'describe', 'another-service-1', m.REGION_ARG)):
            with self.subTest(command=command), self.assertRaisesRegex(SystemExit, 'CLOUD_READ_SCOPE_REJECTED'):
                m.cloud_read(reader, command)
        self.assertEqual(reader.calls, [])


class BindingAndSnapshotTests(OfflineCase):
    def test_complete_fixture_is_redacted_and_cannot_claim_authority_or_deployment(self):
        value, reader, github = self.collect()
        self.assertEqual(value['stage'], 'PREVIEW_V2_APPROVAL_RELEASE_METADATA_READ_COMPLETED')
        self.assertTrue(value['service_metadata_stable_on_reread'])
        self.assertEqual(value['serving_revisions'][0]['binding']['classifieds_enabled'], 'true')
        for key in ('deployment_authority_verified', 'schema_readiness_verified', 'release_gates_verified',
                    'secret_payload_access', 'database_connection_opened', 'cloud_resource_mutation', 'schema_mutation',
                    'role_mutation', 'application_data_mutation', 'application_deployment_performed', 'build_provenance_reread'):
            self.assertIs(value[key], False)
        self.assertEqual(sum(a == m.SERVICE_ARGS for a, _ in reader.calls), 2)
        self.assertTrue(all(a in m.CLOUD_READS or a[:3] == ('run', 'revisions', 'describe') for a, _ in reader.calls))
        self.assertEqual(github.call_args.args[0], m.ENVIRONMENT_PATH)

    def test_serving_revision_binding_is_not_inferred_from_latest_template(self):
        reader = ReaderFixture()
        reader.service['status']['latestCreatedRevisionName'] = OTHER_REVISION
        reader.revisions[m.KNOWN_REVISION]['spec']['containers'][0]['env'][0]['valueFrom']['secretKeyRef']['name'] = 'UNEXPECTED_' + SENTINEL
        value, _, _ = self.collect(reader)
        self.assertTrue(value['service_metadata']['latest_template_binding']['database_url_reference_matches'])
        serving = value['serving_revisions'][0]
        self.assertFalse(serving['binding']['database_url_reference_matches'])
        self.assertEqual(serving['binding']['database_url_reference_form'], 'unrecognized')
        self.assertTrue(serving['matches_previous_revision'])

    def test_zero_percent_tagged_revision_is_read_and_changed_provenance_flagged(self):
        reader = ReaderFixture()
        reader.service['status']['traffic'].append(dict(revisionName=OTHER_REVISION, percent=0, tag='candidate'))
        value, _, _ = self.collect(reader)
        self.assertEqual(len(value['serving_revisions']), 2)
        other = next(x for x in value['serving_revisions'] if x['revision'] == OTHER_REVISION)
        self.assertTrue(other['provenance_followup_required'])
        self.assertTrue(next(x for x in value['service_metadata']['traffic'] if x['revision'] == OTHER_REVISION)['tagged'])

    def test_service_change_including_redacted_tag_change_stops_snapshot(self):
        for change in ('generation', 'traffic', 'tag', 'private_env'):
            with self.subTest(change=change):
                reader = ReaderFixture()
                reader.service['status']['traffic'][0]['tag'] = 'before'
                reader.service_after = copy.deepcopy(reader.service)
                if change == 'generation':
                    reader.service_after['metadata']['generation'] = 9
                    reader.service_after['status']['observedGeneration'] = 9
                elif change == 'traffic':
                    reader.service_after['status']['traffic'][0]['revisionName'] = OTHER_REVISION
                elif change == 'tag':
                    reader.service_after['status']['traffic'][0]['tag'] = 'after'
                else:
                    reader.service_after['spec']['template']['spec']['containers'][0]['env'][3]['value'] = 'changed'
                with patch.object(m, 'gh_json', return_value=environment_fixture()), \
                        self.assertRaisesRegex(SystemExit, 'SERVICE_CHANGED_DURING_METADATA_READ'):
                    m.collect(reader, REFERENCE)

    def test_invalid_traffic_and_unreconciled_generation_fail_closed(self):
        cases = [[], *[[dict(revisionName=m.KNOWN_REVISION, percent=x)] for x in (True, 99, 101, -1, 100.0, '100')],
                 [dict(revisionName='production-backend-1', percent=100)],
                 [dict(revisionName=m.KNOWN_REVISION, percent=100, latestRevision='true')],
                 [dict(revisionName=m.KNOWN_REVISION, percent=100, tag='bad tag')],
                 [dict(revisionName=m.KNOWN_REVISION, percent=100, tag='duplicate'),
                  dict(revisionName=OTHER_REVISION, percent=0, tag='duplicate')],
                 [dict(revisionName=m.KNOWN_REVISION, percent=100)] + [
                     dict(revisionName=m.SERVICE + '-custom-' + str(i), percent=0, tag='tag-' + str(i))
                     for i in range(m.MAX_REVISIONS)]]
        for traffic in cases:
            with self.subTest(traffic=traffic):
                value = service_fixture()
                value['status']['traffic'] = traffic
                with self.assertRaisesRegex(SystemExit, 'SERVICE_TRAFFIC_INVALID'):
                    m.service_summary(value)
        value = service_fixture()
        value['status']['observedGeneration'] = 7
        with self.assertRaisesRegex(SystemExit, 'SERVICE_GENERATION_UNCONFIRMED'):
            m.service_summary(value)

    def test_wrong_service_revision_instance_and_identity_targets_fail_closed(self):
        value = service_fixture()
        value['metadata']['namespace'] = '123'
        with self.assertRaisesRegex(SystemExit, 'SERVICE_IDENTITY_MISMATCH'):
            m.service_summary(value)
        value = revision_fixture()
        value['metadata']['labels']['serving.knative.dev/service'] = 'other-service'
        with self.assertRaisesRegex(SystemExit, 'REVISION_IDENTITY_MISMATCH'):
            m.revision_summary(value, m.KNOWN_REVISION)
        reader = ReaderFixture()
        reader.overrides[('sql', 'instances', 'describe', m.INSTANCE)] = dict(name=m.INSTANCE, project='khedma-dl')
        with self.assertRaisesRegex(SystemExit, 'SQL_INSTANCE_IDENTITY_OR_STATE_MISMATCH'):
            self.collect(reader)
        with self.assertRaisesRegex(SystemExit, 'SERVICE_ACCOUNT_IDENTITY_MISMATCH'):
            m.service_account(dict(email='wrong'), m.IDENTITIES['runtime'])

    def test_secret_aliases_versions_and_plain_values_never_print_payloads(self):
        for target, matches in ((f'projects/{m.NUMBER}/secrets/DATABASE_URL', True),
                                (f'projects/{m.PROJECT}/secrets/DATABASE_URL', True),
                                ('projects/123/secrets/' + SENTINEL, False)):
            value = revision_fixture()
            value['metadata']['annotations']['run.googleapis.com/secrets'] = 'DATABASE_URL:' + target
            result = m.revision_summary(value, m.KNOWN_REVISION)
            self.assertEqual(result['binding']['database_url_reference_matches'], matches)
            self.assertNotIn(SENTINEL, json.dumps(result))
        value = revision_fixture()
        value['spec']['containers'][0]['env'][0] = dict(name='DATABASE_URL', value='postgresql://' + SENTINEL)
        result = m.revision_summary(value, m.KNOWN_REVISION)['binding']
        self.assertEqual(result['database_url_reference_form'], 'plain_value')
        self.assertFalse(result['database_url_reference_matches'])
        self.assertNotIn(SENTINEL, json.dumps(result))
        value = revision_fixture()
        value['spec']['containers'][0]['env'][0]['valueFrom']['secretKeyRef']['key'] = 'latest'
        self.assertFalse(m.revision_summary(value, m.KNOWN_REVISION)['binding']['database_url_reference_matches'])

    def test_classifieds_flag_distinguishes_absent_false_and_invalid_without_echo(self):
        for raw, expected in ((None, 'absent'), ('true', 'true'), ('false', 'false'), ('TRUE', 'invalid'),
                               ('', 'invalid'), (SENTINEL, 'invalid')):
            value = revision_fixture()
            env = value['spec']['containers'][0]['env']
            if raw is None:
                env.pop(2)
            else:
                env[2]['value'] = raw
            result = m.revision_summary(value, m.KNOWN_REVISION)['binding']
            self.assertEqual(result['classifieds_enabled'], expected)
            self.assertNotIn(SENTINEL, json.dumps(result))

    def test_request_timeout_and_operations_binding_are_bounded_metadata(self):
        value = revision_fixture()
        summary = m.revision_summary(value, m.KNOWN_REVISION)['binding']
        self.assertEqual(summary['request_timeout_seconds'], 300)
        self.assertEqual(summary['operations_role_bindings_reference'],
                         dict(form='local_name', version='latest', recognized=True))
        del value['spec']['timeoutSeconds']
        self.assertIsNone(m.revision_summary(value, m.KNOWN_REVISION)['binding']['request_timeout_seconds'])
        for timeout in (True, 0, 3601, SENTINEL):
            value['spec']['timeoutSeconds'] = timeout
            with self.subTest(timeout=timeout), self.assertRaisesRegex(SystemExit, 'REQUEST_TIMEOUT_METADATA_INVALID'):
                m.revision_summary(value, m.KNOWN_REVISION)
        value = revision_fixture()
        value['spec']['containers'][0]['env'][-1]['valueFrom']['secretKeyRef']['key'] = SENTINEL
        summary = m.revision_summary(value, m.KNOWN_REVISION)['binding']
        self.assertFalse(summary['operations_role_bindings_reference']['recognized'])
        self.assertNotIn(SENTINEL, json.dumps(summary))


class PolicyAndAvailabilityTests(OfflineCase):
    def test_optional_denial_is_incomplete_not_absence_or_authority(self):
        reader = ReaderFixture()
        reader.unavailable = {('iam', 'service-accounts', 'describe', m.IDENTITIES['build']),
                              ('projects', 'get-iam-policy', m.PROJECT),
                              ('secrets', 'versions', 'describe', '1', '--secret=DATABASE_MIGRATION_URL')}
        with patch.object(m, 'gh_json', return_value=None):
            result = m.collect(reader, REFERENCE)
        self.assertEqual(result['execution_identities']['build'], dict(status='read_unavailable', enabled=None))
        self.assertIsNone(result['project_direct_policy']['direct_bindings'])
        self.assertEqual(result['secret_version_metadata']['DATABASE_MIGRATION_URL']['status'], 'read_unavailable')
        self.assertFalse(result['github_preview_environment']['complete'])
        self.assertFalse(result['deployment_authority_verified'])

    def test_conditional_direct_bindings_are_named_but_not_evaluated(self):
        result, _, _ = self.collect()
        binding = result['project_direct_policy']['direct_bindings']['runtime']
        self.assertEqual(binding, [dict(role='roles/cloudsql.client', conditional=True)])
        self.assertFalse(result['project_direct_policy']['effective_permissions_verified'])
        self.assertEqual(result['deployer_direct_policy']['direct_bindings']['historical_wif_principal'],
                         [dict(role='roles/iam.workloadIdentityUser', conditional=False)])
        self.assertEqual(result['project_direct_policy']['direct_bindings']['owner'],
                         [dict(role='roles/owner', conditional=False)])
        for role in ('runtime', 'migrator', 'build'):
            self.assertEqual(result['scoped_service_account_policies'][role]['direct_bindings']['deployer'],
                             [dict(role='roles/iam.serviceAccountUser', conditional=False)])
        with self.assertRaisesRegex(SystemExit, 'IAM_POLICY_CONDITIONS_UNCONFIRMED'):
            m.policy_summary(dict(version=1, bindings=[dict(role='roles/run.admin', members=[m.WIF_MEMBER],
                condition=dict(expression=SENTINEL, title=SENTINEL))]), {'wif': m.WIF_MEMBER})

    def test_wif_drift_disabled_accounts_and_secret_state_do_not_become_authority(self):
        reader = ReaderFixture()
        args = ('iam', 'workload-identity-pools', 'providers', 'describe', m.PROVIDER,
                '--location=global', '--workload-identity-pool=' + m.POOL)
        reader.overrides[args] = dict(name=m.PROVIDER_NAME, state='ACTIVE', disabled=False,
            attributeMapping=REFERENCE['mapping'], attributeCondition=SENTINEL, oidc=dict(issuerUri=SENTINEL))
        args = ('secrets', 'versions', 'describe', '1', '--secret=DATABASE_URL')
        reader.overrides[args] = dict(name=f'projects/{m.NUMBER}/secrets/DATABASE_URL/versions/1', state='DISABLED')
        result, _, _ = self.collect(reader)
        self.assertFalse(result['workload_identity_provider']['condition_matches_historical_pr274'])
        self.assertFalse(result['workload_identity_provider']['github_oidc_matches'])
        self.assertEqual(result['secret_version_metadata']['DATABASE_URL']['state'], 'DISABLED')
        self.assertFalse(result['release_gates_verified'])

    def test_environment_counts_only_and_custom_pagination_limit_is_honest(self):
        env = environment_fixture(custom=True)
        branches = dict(total_count=101, branch_policies=[dict(name=REFERENCE['branch'], type='branch'),
                         dict(name=SENTINEL, type='branch'), dict(name='main', type='tag')])
        value = m.environment_summary(env, branches, REFERENCE['branch'])
        self.assertFalse(value['complete'])
        self.assertTrue(value['custom_branch_rules']['historical_branch_exact'])
        self.assertFalse(value['custom_branch_rules']['main_exact'])
        self.assertEqual(value['protection_rules'][0]['required_reviewer_count'], 1)
        self.assertNotIn(SENTINEL, json.dumps(value))
        branches['total_count'] = 3
        self.assertTrue(m.environment_summary(env, branches, REFERENCE['branch'])['complete'])
        self.assertFalse(m.environment_summary(env, None, REFERENCE['branch'])['complete'])

    def test_optional_admin_bypass_is_unknown_but_malformed_reviewers_stop(self):
        env = environment_fixture()
        del env['can_admins_bypass']
        value = m.environment_summary(env)
        self.assertIsNone(value['can_admins_bypass'])
        self.assertFalse(value['complete'])
        env['can_admins_bypass'] = 'false'
        with self.assertRaisesRegex(SystemExit, 'GITHUB_ENVIRONMENT_METADATA_INVALID'):
            m.environment_summary(env)
        for reviewer in (None, {}, dict(type='User', reviewer=dict(id=True)), dict(type='User', reviewer=dict(id=0))):
            env = environment_fixture()
            env['protection_rules'][0]['reviewers'] = [reviewer]
            with self.subTest(reviewer=reviewer), self.assertRaisesRegex(SystemExit, 'GITHUB_ENVIRONMENT_METADATA_INVALID'):
                m.environment_summary(env)

    def test_inspect_outputs_one_redacted_receipt_and_removes_private_workspace(self):
        reader = ReaderFixture()
        directories = []

        def sources(work):
            directories.append(work)
            self.assertEqual(stat.S_IMODE(work.stat().st_mode), 0o700)
            return reader, REFERENCE

        output = io.StringIO()
        with patch.object(m.shutil, 'which', return_value='/fixture/tool'), patch.object(m, 'load_sources', side_effect=sources), \
                patch.object(m, 'gh_json', return_value=environment_fixture()), contextlib.redirect_stdout(output):
            m.inspect()
        self.assertEqual(len(output.getvalue().splitlines()), 1)
        self.assertNotIn(SENTINEL, output.getvalue())
        self.assertFalse(json.loads(output.getvalue())['deployment_authority_verified'])
        self.assertTrue(directories and all(not path.exists() for path in directories))


if __name__ == '__main__':
    unittest.main()
