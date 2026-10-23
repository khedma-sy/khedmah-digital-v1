"""Offline candidate build boundaries: no live cloud calls or source mutation."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
import urllib.error
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('approval_candidate_test', ROOT / 'scripts/build-preview-v2-approval-candidate.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BUILD_ID = '11111111-2222-4333-8444-555555555555'
TOKEN = 'PRIVATE_TOKEN_SENTINEL_DO_NOT_PRINT_0123456789'
PRIVATE = 'PRIVATE_REMOTE_PAYLOAD_SENTINEL'


def files_fixture():
    files = {path: (path + '\n').encode() for path in m.FIXED_FILES}
    files['.npmrc'] = b'strict-allow-scripts=true\n'
    files['Dockerfile.backend'] = b'FROM example\nCOPY package.json package-lock.json .npmrc ./\nFROM example\nCOPY package.json package-lock.json .npmrc ./\n'
    files['apps/backend/package.json'] = b'{}\n'
    files['apps/backend/src/main.ts'] = b'export const fixture = true;\n'
    return files


def tree_fixture(files):
    rows = {}
    for path, data in files.items():
        rows[path] = dict(path=path, type='blob', mode='100644', sha=m.git_hash('blob', data), size=len(data))
        parts = path.split('/')[:-1]
        while parts:
            folder = '/'.join(parts)
            rows.setdefault(folder, dict(path=folder, type='tree', mode='040000'))
            parts.pop()
    def digest(directory):
        children = [row for path, row in rows.items() if path.rpartition('/')[0] == directory]
        children.sort(key=lambda row: (row['path'].split('/')[-1] + ('/' if row['type'] == 'tree' else '')).encode())
        data = b''
        for row in children:
            if row['type'] == 'tree':
                row['sha'] = digest(row['path'])
            data += (row['mode'].lstrip('0') + ' ' + row['path'].split('/')[-1]).encode() + b'\0' + bytes.fromhex(row['sha'])
        return m.git_hash('tree', data)
    return dict(sha=digest(''), truncated=False, tree=list(rows.values()))


def archive_fixture(files, extra=None, duplicate=None, link=None):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as archive:
        for path, data in [*files.items(), *((extra or {}).items())]:
            entry = tarfile.TarInfo('repository-fixture/' + path)
            entry.size = len(data)
            entry.mode = 0o644
            if path == link:
                entry.type, entry.linkname, entry.size = tarfile.SYMTYPE, '/outside/private', 0
            archive.addfile(entry, io.BytesIO(data) if entry.isfile() else None)
            if path == duplicate:
                archive.addfile(entry, io.BytesIO(data))
    return stream.getvalue()


def object_fixture(intent):
    return dict(bucket=m.SOURCE_BUCKET, name=intent['object'], size=str(intent['archive_size']),
                md5Hash=intent['archive_md5'], generation=intent.get('generation', '123456789'))


def build_fixture(intent, state='SUCCESS'):
    result = copy.deepcopy(m.build_request(intent))
    result.update(id=BUILD_ID, projectId=m.PROJECT, name=m.BUILD_PARENT + '/builds/' + BUILD_ID, status=state)
    result['steps'][0].update(status='SUCCESS', exitCode=0)
    result['results'] = dict(images=[dict(name=result['images'][0], digest='sha256:' + 'a' * 64)],
                             buildStepImages=['sha256:' + 'b' * 64])
    result['sourceProvenance'] = dict(resolvedStorageSource=copy.deepcopy(result['source']['storageSource']))
    return result


class OfflineCase(unittest.TestCase):
    def setUp(self):
        for name in ('run', 'Popen'):
            guard = patch.object(subprocess, name, side_effect=AssertionError('UNMOCKED_EXTERNAL_PROCESS'))
            guard.start()
            self.addCleanup(guard.stop)
        guard = patch.object(m.urllib.request, 'build_opener', side_effect=AssertionError('UNMOCKED_HTTP'))
        guard.start()
        self.addCleanup(guard.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'intent'

    def new_intent(self, uploaded=False):
        intent = m.create_intent(self.root, b'INERT_SOURCE_ARCHIVE')
        if uploaded:
            intent.update(generation='123456789', phase='source_uploaded')
            m.save_intent(self.root, intent)
        return intent

    def fixture_manifest(self, files=None):
        files = files or files_fixture()
        tree = tree_fixture(files)
        values = dict(SOURCE_TREE=tree['sha'], EXPECTED_FILES=len(files),
                      CONFIG_BLOB=m.git_hash('blob', files['cloudbuild.preview-backend.yaml']),
                      DOCKERFILE_BLOB=m.git_hash('blob', files['Dockerfile.backend']),
                      NPMRC_BLOB=m.git_hash('blob', files['.npmrc']))
        values['SOURCE_MANIFEST_SHA256'] = m.json_sha256([
            (row['path'], row['mode'], row['sha'], row['size'])
            for row in sorted(tree['tree'], key=lambda item: item['path']) if row['type'] == 'blob'])
        with patch.multiple(m, **values):
            manifest = m.validate_tree(tree)
        return files, tree, values, manifest


class SourceTests(OfflineCase):
    def test_git_tree_hashes_bind_selected_source_and_reject_tampering(self):
        files, tree, values, manifest = self.fixture_manifest()
        self.assertEqual(set(files), set(manifest))
        for change in ('hash', 'duplicate', 'truncated', 'missing_parent'):
            bad = copy.deepcopy(tree)
            if change == 'hash': bad['tree'][0]['sha'] = 'f' * 40
            if change == 'duplicate': bad['tree'].append(copy.deepcopy(bad['tree'][0]))
            if change == 'truncated': bad['truncated'] = True
            if change == 'missing_parent': bad['tree'] = [x for x in bad['tree'] if x['path'] != 'apps']
            with self.subTest(change=change), patch.multiple(m, **values), self.assertRaises(SystemExit):
                m.validate_tree(bad)

    def test_archive_output_is_deterministic_and_contains_only_verified_files(self):
        files, _, _, manifest = self.fixture_manifest()
        archive = archive_fixture(files, extra={'gha-creds-private.json': TOKEN.encode(), '.env': PRIVATE.encode()})
        one, two = m.package_source(archive, manifest), m.package_source(archive, manifest)
        self.assertEqual(one, two)
        with tarfile.open(fileobj=io.BytesIO(one), mode='r:gz') as packaged:
            self.assertEqual(set(packaged.getnames()), set(files))
            for entry in packaged:
                self.assertTrue(entry.isfile())
                self.assertEqual(entry.mode, 0o644)
                self.assertEqual(entry.uid, 0)
                self.assertEqual(entry.mtime, 0)
                self.assertEqual(packaged.extractfile(entry).read(), files[entry.name])

    def test_archive_rejects_changed_missing_duplicate_link_and_traversal_members(self):
        files, _, _, manifest = self.fixture_manifest()
        changed = dict(files, **{'apps/backend/src/main.ts': b'TAMPERED'})
        missing = dict(files)
        missing.pop('apps/backend/src/main.ts')
        cases = [archive_fixture(changed), archive_fixture(missing),
                 archive_fixture(files, duplicate='.npmrc'), archive_fixture(files, link='.npmrc'),
                 archive_fixture(files, extra={'../escape': b'bad'})]
        for archive in cases:
            with self.subTest(size=len(archive)), self.assertRaises(SystemExit):
                m.package_source(archive, manifest)

    def test_canonical_local_install_policy_bytes_match_pins(self):
        for name, expected in (('Dockerfile.backend', m.DOCKERFILE_BLOB), ('.npmrc', m.NPMRC_BLOB)):
            self.assertEqual(m.git_hash('blob', (ROOT / name).read_bytes()), expected)

    def test_source_download_is_fixed_get_only_and_debug_is_removed(self):
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'fixture', b'')) as run, \
                patch.dict(os.environ, {'GH_DEBUG': 'api', 'DEBUG': 'all'}):
            self.assertEqual(m.gh_read('repos/' + m.REPO + '/tarball/' + m.SOURCE_COMMIT), b'fixture')
            self.assertEqual(run.call_args.args[0][:6], ['gh', 'api', '--hostname', 'github.com', '--method', 'GET'])
            self.assertNotIn('GH_DEBUG', run.call_args.kwargs['env'])
            self.assertNotIn('DEBUG', run.call_args.kwargs['env'])
            with self.assertRaisesRegex(SystemExit, 'GITHUB_READ_SCOPE_REJECTED'):
                m.gh_read('repos/' + m.REPO + '/tarball/main')
            self.assertEqual(run.call_count, 1)


class IntentTests(OfflineCase):
    def test_durable_private_intent_blocks_second_attempt(self):
        intent = self.new_intent()
        self.assertEqual(m.load_intent(self.root), intent)
        self.assertEqual(m.intent_path(self.root).stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.root.stat().st_mode & 0o777, 0o700)
        with self.assertRaisesRegex(SystemExit, 'EXISTING_INTENT_STATUS_ONLY_NO_RESUBMIT'):
            m.create_intent(self.root, b'ANOTHER_ARCHIVE')

    def test_untrusted_or_unsafe_local_state_is_rejected(self):
        intent = self.new_intent()
        bad = dict(intent, project='foreign-project')
        with self.assertRaises(SystemExit): m.validate_intent(bad)
        m.intent_path(self.root).chmod(0o644)
        with self.assertRaisesRegex(SystemExit, 'INTENT_FILE_NOT_PRIVATE'): m.load_intent(self.root)
        m.intent_path(self.root).unlink()
        m.intent_path(self.root).symlink_to('/outside/private')
        with self.assertRaises(OSError): m.load_intent(self.root)

    def test_upload_records_uncertainty_before_one_network_call(self):
        intent = self.new_intent()
        def lose_reply(*args, **kwargs):
            self.assertEqual(m.load_intent(self.root)['phase'], 'source_upload_requested')
            raise SystemExit('STOP: MUTATION_UNCONFIRMED_STATUS_ONLY_NO_RESUBMIT')
        api = Mock(side_effect=lose_reply)
        with self.assertRaises(SystemExit): m.upload_source(api, self.root, intent, b'INERT_SOURCE_ARCHIVE')
        self.assertEqual(api.call_count, 1)
        self.assertIn('ifGenerationMatch=0', api.call_args.args[1])
        with self.assertRaises(SystemExit): m.upload_source(api, self.root, intent, b'INERT_SOURCE_ARCHIVE')
        self.assertEqual(api.call_count, 1)

    def test_upload_binds_generation_and_checks_checksum(self):
        intent = self.new_intent()
        api = Mock(return_value=object_fixture(intent))
        m.upload_source(api, self.root, intent, b'INERT_SOURCE_ARCHIVE')
        self.assertEqual(m.load_intent(self.root)['generation'], '123456789')
        self.assertEqual(intent['phase'], 'source_uploaded')
        for key, value in (('bucket', 'foreign'), ('name', 'foreign'), ('size', '0'), ('md5Hash', 'wrong')):
            bad = dict(object_fixture(intent), **{key: value})
            with self.subTest(field=key), self.assertRaises(SystemExit): m.validate_object(bad, intent)

    def test_submit_records_unknown_outcome_and_never_automatically_retries(self):
        intent = self.new_intent(uploaded=True)
        def lose_reply(*args, **kwargs):
            self.assertEqual(m.load_intent(self.root)['phase'], 'build_submission_requested')
            raise SystemExit('STOP: MUTATION_UNCONFIRMED_STATUS_ONLY_NO_RESUBMIT')
        api = Mock(side_effect=lose_reply)
        with self.assertRaises(SystemExit): m.submit_build(api, self.root, intent)
        with self.assertRaises(SystemExit): m.submit_build(api, self.root, intent)
        self.assertEqual(api.call_count, 1)


class BuildTests(OfflineCase):
    def test_documented_source_fetcher_defaults_preserve_exact_generation(self):
        intent = self.new_intent(uploaded=True)
        for fetcher in ('SOURCE_FETCHER_UNSPECIFIED', 'GSUTIL'):
            value = build_fixture(intent)
            value['source']['storageSource']['sourceFetcher'] = fetcher
            value['sourceProvenance']['resolvedStorageSource']['sourceFetcher'] = fetcher
            self.assertTrue(m.validate_build(value, intent)['build_path_verified'])
        for fetcher in ('GCS_FETCHER', 'unknown', None):
            value = build_fixture(intent)
            value['source']['storageSource']['sourceFetcher'] = fetcher
            with self.subTest(fetcher=fetcher), self.assertRaises(SystemExit): m.validate_build(value, intent)
        value = build_fixture(intent)
        value['source']['gitSource'] = {'url': PRIVATE}
        with self.assertRaises(SystemExit): m.validate_build(value, intent)

    def test_receipt_cannot_override_false_release_flags(self):
        intent = self.new_intent(uploaded=True)
        for key in ('cloud_run_mutation', 'schema_readiness_verified', 'production_readiness_verified', 'resubmission_allowed'):
            with self.subTest(field=key), self.assertRaisesRegex(SystemExit, 'RECEIPT_FIELDS_REJECTED'):
                m.receipt(intent, {'build_status': 'SUCCESS', key: True}, False)

    def test_request_is_only_a_fixed_backend_image_build(self):
        intent = self.new_intent(uploaded=True)
        request = m.build_request(intent)
        self.assertEqual(request['serviceAccount'], m.SA_NAME)
        self.assertEqual(request['source']['storageSource']['generation'], intent['generation'])
        self.assertEqual(len(request['steps']), 1)
        self.assertEqual(request['steps'][0]['args'][0], 'build')
        self.assertEqual(request['options']['logging'], 'CLOUD_LOGGING_ONLY')
        self.assertIn(intent['build_tag'], request['tags'])
        for field in ('secrets', 'availableSecrets', 'substitutions', 'logsBucket'):
            self.assertNotIn(field, request)

    def test_success_requires_bound_source_image_and_builder_digests(self):
        intent = self.new_intent(uploaded=True)
        result = m.validate_build(build_fixture(intent), intent)
        self.assertTrue(result['build_path_verified'])
        self.assertEqual(result['image_reference'], m.IMAGE + '@sha256:' + 'a' * 64)
        for change in ('source', 'image', 'step_image', 'service', 'project', 'step', 'env', 'secret', 'tag', 'status'):
            bad = build_fixture(intent)
            if change == 'source': bad['sourceProvenance']['resolvedStorageSource']['generation'] = '999'
            if change == 'image': bad['results']['images'][0]['digest'] = 'latest'
            if change == 'step_image': bad['results']['buildStepImages'] = []
            if change == 'service': bad['serviceAccount'] = 'foreign'
            if change == 'project': bad['projectId'] = 'foreign'
            if change == 'step': bad['steps'].append(dict(bad['steps'][0]))
            if change == 'env': bad['steps'][0]['env'] = ['DATABASE_URL=' + PRIVATE]
            if change == 'secret': bad['availableSecrets'] = {'secretManager': [PRIVATE]}
            if change == 'tag': bad['tags'].append('unrelated')
            if change == 'status': bad['status'] = 'UNKNOWN_UNRECOGNIZED'
            with self.subTest(change=change), self.assertRaises(SystemExit): m.validate_build(bad, intent)

    def test_submit_makes_one_post_then_known_id_read(self):
        intent = self.new_intent(uploaded=True)
        api = Mock(side_effect=[{'metadata': {'build': {'id': BUILD_ID}}}, build_fixture(intent)])
        result = m.submit_build(api, self.root, intent)
        self.assertEqual([call.args[0] for call in api.call_args_list], ['POST', 'GET'])
        self.assertTrue(result['build_path_verified'])
        self.assertEqual(m.load_intent(self.root)['build_id'], BUILD_ID)

    def test_non_success_and_receipt_never_assert_release_readiness(self):
        intent = self.new_intent(uploaded=True)
        for state in ('WORKING', 'FAILURE', 'TIMEOUT', 'CANCELLED'):
            value = m.receipt(intent, m.validate_build(build_fixture(intent, state), intent), False)
            self.assertFalse(value['build_path_verified'])
            self.assertTrue(value['cloud_resource_mutation'])
            for key in ('application_deployment_performed', 'schema_mutation', 'cloud_run_mutation',
                        'secret_payload_access', 'release_gates_verified', 'production_readiness_verified'):
                self.assertFalse(value[key])

    def test_status_recovers_lost_id_with_only_gets_without_rewriting_state(self):
        intent = self.new_intent(uploaded=True)
        intent['phase'] = 'build_submission_requested'
        m.save_intent(self.root, intent)
        before = m.intent_path(self.root).read_bytes()
        api = Mock(side_effect=[object_fixture(intent), {'builds': [build_fixture(intent)]}])
        result = m.status(api, intent)
        self.assertTrue(result['build_path_verified'])
        self.assertEqual([call.args[0] for call in api.call_args_list], ['GET', 'GET'])
        self.assertEqual(m.intent_path(self.root).read_bytes(), before)
        receipt = m.receipt(intent, result, True)
        self.assertFalse(receipt['cloud_resource_mutation'])
        self.assertFalse(receipt['build_submission_performed'])

    def test_status_zero_matches_or_missing_object_never_authorizes_retry(self):
        intent = self.new_intent(uploaded=True)
        for responses in ([None], [object_fixture(intent), {}]):
            api = Mock(side_effect=responses)
            result = m.status(api, intent)
            self.assertEqual(result['build_status'], 'UNCONFIRMED')
            self.assertFalse(result['resubmission_allowed'])
            self.assertFalse(result['build_path_verified'])
            self.assertTrue(all(call.args[0] == 'GET' for call in api.call_args_list))

    def test_status_rejects_ambiguous_paginated_or_unrelated_results(self):
        intent = self.new_intent(uploaded=True)
        for listing in ({'builds': [build_fixture(intent)] * 2}, {'nextPageToken': 'more'},
                        {'builds': [dict(build_fixture(intent), tags=['foreign'])]}):
            with self.subTest(listing=list(listing)), self.assertRaises(SystemExit):
                m.status(Mock(side_effect=[object_fixture(intent), listing]), intent)

    def test_poll_deadline_never_creates_or_cancels_build(self):
        intent = self.new_intent(uploaded=True)
        intent['build_id'] = BUILD_ID
        api = Mock()
        with patch.object(m.time, 'monotonic', side_effect=[0, 1501]), patch.object(m.time, 'sleep') as sleep:
            result = m.wait_for_build(api, intent, {'build_status': 'WORKING', 'build_path_verified': False})
        self.assertTrue(result['wait_window_elapsed'])
        api.assert_not_called()
        sleep.assert_not_called()


class BuildDiagnosticTests(OfflineCase):
    def acknowledged_intent(self):
        intent = self.new_intent(uploaded=True)
        intent.update(build_id=BUILD_ID, phase='build_acknowledged',
                      submitted_config_sha256=m.json_sha256(m.build_request(intent)))
        m.save_intent(self.root, intent)
        return intent

    def mismatched_options_build(self, intent):
        value = build_fixture(intent)
        value['options']['dynamicSubstitutions'] = False
        value['options']['pool'] = {'name': PRIVATE}
        return value

    def test_option_diagnostic_reports_only_keys_and_match_flags(self):
        intent = self.acknowledged_intent()
        result = m.diagnose_build_options(self.mismatched_options_build(intent), intent)
        self.assertFalse(result['strict_validation_succeeded'])
        self.assertFalse(result['build_path_verified'])
        self.assertEqual(result['diagnostic_scope'], 'options_only')
        self.assertEqual(result['unexpected_option_keys'], ['dynamicSubstitutions', 'pool'])
        self.assertTrue(result['logging_matches'])
        self.assertTrue(result['substitution_option_matches'])
        self.assertTrue(result['options_values_redacted'])
        self.assertNotIn(PRIVATE, json.dumps(result, sort_keys=True))

    def test_option_diagnostic_does_not_weaken_strict_validation(self):
        intent = self.acknowledged_intent()
        value = self.mismatched_options_build(intent)
        with self.assertRaisesRegex(SystemExit, 'BUILD_OPTIONS_MISMATCH'):
            m.validate_build(value, intent)
        result = m.diagnose_build_options(value, intent)
        self.assertFalse(result['strict_validation_succeeded'])
        self.assertFalse(result['resubmission_allowed'])

    def test_option_diagnostic_rejects_non_option_request_mismatch(self):
        intent = self.acknowledged_intent()
        value = self.mismatched_options_build(intent)
        value['tags'].append('foreign')
        with self.assertRaisesRegex(SystemExit, 'BUILD_DIAGNOSTIC_SCOPE_MISMATCH'):
            m.diagnose_build_options(value, intent)

    def test_option_diagnostic_rejects_secret_inputs_even_when_options_mismatch(self):
        intent = self.acknowledged_intent()
        value = self.mismatched_options_build(intent)
        value['availableSecrets'] = {'secretManager': [{'versionName': PRIVATE}]}
        with self.assertRaisesRegex(SystemExit, 'BUILD_DIAGNOSTIC_UNEXPECTED_INPUTS'):
            m.diagnose_build_options(value, intent)

    def test_option_diagnostic_rejects_untrusted_option_key_shape(self):
        intent = self.acknowledged_intent()
        value = build_fixture(intent)
        value['options'][1] = PRIVATE
        with self.assertRaisesRegex(SystemExit, 'BUILD_DIAGNOSTIC_OPTIONS_INVALID'):
            m.diagnose_build_options(value, intent)

    def test_option_diagnostic_accepts_already_strict_build_without_expanding_scope(self):
        intent = self.acknowledged_intent()
        result = m.diagnose_build_options(build_fixture(intent), intent)
        self.assertTrue(result['strict_validation_succeeded'])
        self.assertTrue(result['build_path_verified'])
        self.assertEqual(result['unexpected_option_keys'], [])
        self.assertEqual(result['missing_required_option_keys'], [])

    def test_diagnose_status_reads_only_saved_object_and_exact_build_id(self):
        intent = self.acknowledged_intent()
        api = Mock(side_effect=[object_fixture(intent), self.mismatched_options_build(intent)])
        result = m.diagnose_status(api, intent)
        self.assertEqual([call.args[0] for call in api.call_args_list], ['GET', 'GET'])
        self.assertEqual(api.call_args_list[1].args[1], m.BUILDS_URL + '/' + BUILD_ID)
        self.assertTrue(result['source_object_observed'])
        self.assertFalse(result['resubmission_allowed'])

    def test_diagnose_status_requires_acknowledged_saved_build_id(self):
        intent = self.new_intent(uploaded=True)
        intent['phase'] = 'build_submission_requested'
        m.save_intent(self.root, intent)
        api = Mock()
        with self.assertRaisesRegex(SystemExit, 'BUILD_DIAGNOSTIC_BUILD_ID_REQUIRED'):
            m.diagnose_status(api, intent)
        api.assert_not_called()

    def test_option_diagnostic_classifies_default_pool_and_worker_release_without_values(self):
        intent = self.acknowledged_intent()
        value = build_fixture(intent)
        value['options']['pool'] = {'workerRelease': 'legacy', 'resolvedWorkerRelease': '2026.09'}
        value['options']['workerRelease'] = 'legacy'
        result = m.diagnose_build_options(value, intent)
        self.assertTrue(result['pool_present'])
        self.assertFalse(result['pool_name_nonempty'])
        self.assertEqual(result['pool_unexpected_keys'], [])
        self.assertTrue(result['pool_worker_release_is_legacy'])
        self.assertTrue(result['pool_resolved_worker_release_is_legacy_or_version'])
        self.assertTrue(result['worker_release_is_legacy'])
        self.assertTrue(result['pool_worker_release_matches_top_level'])
        serialized = json.dumps(result, sort_keys=True)
        self.assertNotIn('2026.09', serialized)
        self.assertNotIn('"legacy"', serialized)

    def test_option_diagnostic_detects_private_pool_name_without_exposing_it(self):
        intent = self.acknowledged_intent()
        value = build_fixture(intent)
        value['options']['pool'] = {'name': 'projects/secret-project/locations/europe-west1/workerPools/private'}
        value['options']['workerRelease'] = 'legacy'
        result = m.diagnose_build_options(value, intent)
        self.assertTrue(result['pool_name_present'])
        self.assertTrue(result['pool_name_nonempty'])
        self.assertTrue(result['pool_name_matches_worker_pool_resource'])
        self.assertNotIn('secret-project', json.dumps(result, sort_keys=True))
        self.assertNotIn('workerPools/private', json.dumps(result, sort_keys=True))

    def test_option_diagnostic_reports_unknown_pool_keys_without_values(self):
        intent = self.acknowledged_intent()
        value = build_fixture(intent)
        value['options']['pool'] = {'futureField': PRIVATE}
        value['options']['workerRelease'] = 'legacy'
        result = m.diagnose_build_options(value, intent)
        self.assertEqual(result['pool_unexpected_keys'], ['futureField'])
        self.assertNotIn(PRIVATE, json.dumps(result, sort_keys=True))

    def test_option_diagnostic_classifies_nondefault_worker_release_fail_closed_for_later_review(self):
        intent = self.acknowledged_intent()
        value = build_fixture(intent)
        value['options']['pool'] = {}
        value['options']['workerRelease'] = 'rapid'
        result = m.diagnose_build_options(value, intent)
        self.assertTrue(result['worker_release_present'])
        self.assertFalse(result['worker_release_is_legacy'])
        self.assertTrue(result['worker_release_is_known_channel'])
        self.assertFalse(result['worker_release_is_version'])

    def test_diagnostic_receipt_is_read_only_redacted_and_field_bounded(self):
        intent = self.acknowledged_intent()
        result = m.diagnose_build_options(self.mismatched_options_build(intent), intent)
        result.update(source_object_observed=True, source_generation=intent['generation'])
        receipt = m.diagnostic_receipt(intent, result)
        self.assertEqual(receipt['stage'], 'PREVIEW_V2_APPROVAL_CANDIDATE_BUILD_OPTIONS_DIAGNOSTIC')
        self.assertTrue(receipt['current_invocation_read_only'])
        self.assertTrue(receipt['diagnostic_values_redacted'])
        self.assertFalse(receipt['cloud_resource_mutation'])
        self.assertFalse(receipt['build_submission_performed'])
        self.assertFalse(receipt['resubmission_allowed'])
        self.assertNotIn(PRIVATE, json.dumps(receipt, sort_keys=True))
        bad = dict(result, secret_payload_access=True)
        with self.assertRaisesRegex(SystemExit, 'DIAGNOSTIC_RECEIPT_FIELDS_REJECTED'):
            m.diagnostic_receipt(intent, bad)


class TransportTests(OfflineCase):
    def test_service_account_resource_alias_must_match_its_verified_identity(self):
        value = dict(name=m.SA_NAME, projectId=m.PROJECT, email=m.BUILD_SA, uniqueId='123456789012345', disabled=False)
        self.assertEqual(m.validate_service_account(value), value['uniqueId'])
        alias = dict(value, name='projects/' + m.PROJECT + '/serviceAccounts/' + value['uniqueId'])
        self.assertEqual(m.validate_service_account(alias), value['uniqueId'])
        for bad in (dict(alias, uniqueId='999999999999999'), dict(alias, email='foreign@example.com'),
                    dict(alias, disabled=True), dict(alias, name=alias['name'].replace(m.PROJECT, 'foreign'))):
            with self.assertRaises(SystemExit): m.validate_service_account(bad)

    def test_unspecified_repository_defaults_are_bounded_to_standard_docker(self):
        base = dict(name=m.AR_NAME, format='DOCKER')
        for value in (base, dict(base, mode='MODE_UNSPECIFIED'), dict(base, mode='STANDARD_REPOSITORY'),
                      dict(base, mode='MODE_UNSPECIFIED', disallowUnspecifiedMode=False)):
            m.validate_repository(value)
        for value in (dict(base, mode='REMOTE_REPOSITORY'), dict(base, disallowUnspecifiedMode=True),
                      dict(base, remoteRepositoryConfig={}), dict(base, virtualRepositoryConfig={}),
                      dict(base, format='MAVEN'), dict(base, mode=None)):
            with self.assertRaises(SystemExit): m.validate_repository(value)

    def test_resource_preflight_requires_existing_exact_bucket_repository_and_build_identity(self):
        values = {
            m.BUCKET_URL: dict(name=m.SOURCE_BUCKET, projectNumber=m.NUMBER, location=m.REGION.upper(),
                iamConfiguration=dict(uniformBucketLevelAccess=dict(enabled=True), publicAccessPrevention='enforced')),
            m.AR_URL: dict(name=m.AR_NAME, format='DOCKER', mode='STANDARD_REPOSITORY'),
            m.SA_URL: dict(name=m.SA_NAME, projectId=m.PROJECT, email=m.BUILD_SA, disabled=False, uniqueId='123456789012345'),
            m.PROJECT_TEST_URL: dict(permissions=m.PROJECT_PERMISSIONS),
            m.BUCKET_TEST_URL: dict(permissions=m.BUCKET_PERMISSIONS),
            m.SA_URL + ':testIamPermissions': dict(permissions=['iam.serviceAccounts.actAs']),
            m.AR_URL + ':testIamPermissions': dict(permissions=['artifactregistry.repositories.get'])}
        calls = []
        def api(method, url, body=None):
            calls.append((method, url))
            return copy.deepcopy(values[url])
        m.preflight_resources(api)
        self.assertTrue(all(method == 'GET' or url.endswith(':testIamPermissions') for method, url in calls))
        for url, field, wrong in ((m.BUCKET_URL, 'projectNumber', '999'), (m.AR_URL, 'format', 'MAVEN'),
                                  (m.SA_URL, 'disabled', True), (m.PROJECT_TEST_URL, 'permissions', [])):
            original = values[url][field]
            values[url][field] = wrong
            with self.subTest(resource=url), self.assertRaises(SystemExit): m.preflight_resources(api)
            values[url][field] = original
        self.assertFalse(self.root.exists())

    def test_transport_rejects_added_build_steps_or_credentials_before_network(self):
        intent = self.new_intent(uploaded=True)
        intent['phase'] = 'build_submission_requested'
        api = m.GoogleApi(TOKEN, intent)
        for change in ('extra_step', 'secret', 'wrong_generation'):
            body = m.build_request(intent)
            if change == 'extra_step': body['steps'].append({'name': 'unexpected'})
            if change == 'secret': body['secrets'] = [PRIVATE]
            if change == 'wrong_generation': body['source']['storageSource']['generation'] = '999'
            with self.subTest(change=change), self.assertRaisesRegex(SystemExit, 'HTTP_BUILD_BODY_REJECTED'):
                api('POST', m.BUILDS_URL + '?projectId=' + m.PROJECT, body)

    def test_google_scope_excludes_other_targets_and_all_release_apis(self):
        intent = self.new_intent(uploaded=True)
        for method, url in [('PATCH', 'https://run.googleapis.com/v2/projects/' + m.PROJECT),
                            ('GET', 'https://secretmanager.googleapis.com/v1/anything:access'),
                            ('POST', m.upload_url(intent).replace('ifGenerationMatch=0', 'ifGenerationMatch=1')),
                            ('POST', m.BUILDS_URL.replace(m.PROJECT, 'foreign') + '?projectId=foreign')]:
            self.assertFalse(m.allowed_request(method, url, intent))
        self.assertTrue(m.allowed_request('POST', m.upload_url(intent), intent))
        self.assertTrue(m.allowed_request('POST', m.BUILDS_URL + '?projectId=' + m.PROJECT, intent))

    def test_readonly_transport_rejects_upload_before_opening_network(self):
        intent = self.new_intent(uploaded=True)
        api = m.GoogleApi(TOKEN, intent, readonly=True)
        with self.assertRaisesRegex(SystemExit, 'READ_ONLY_MODE_REJECTED_MUTATION'):
            api('POST', m.upload_url(intent), b'INERT_SOURCE_ARCHIVE', content_type='application/gzip')

    def test_http_failures_are_single_attempts_without_token_or_remote_error_text(self):
        intent = self.new_intent(uploaded=True)
        intent['phase'] = 'build_submission_requested'
        api = m.GoogleApi(TOKEN, intent)
        for error in (urllib.error.HTTPError(m.BUILDS_URL, 403, PRIVATE, {}, io.BytesIO(PRIVATE.encode())), OSError(PRIVATE)):
            opener = Mock()
            opener.open.side_effect = error
            with patch.object(m.urllib.request, 'build_opener', return_value=opener), self.assertRaises(SystemExit) as caught:
                api('POST', m.BUILDS_URL + '?projectId=' + m.PROJECT, m.build_request(intent))
            self.assertEqual(opener.open.call_count, 1)
            self.assertNotIn(PRIVATE, str(caught.exception))
            self.assertNotIn(TOKEN, str(caught.exception))

    def test_selected_permissions_fail_closed_on_missing_extra_or_duplicates(self):
        m.check_permissions({'permissions': ['b', 'a']}, ['a', 'b'])
        for value in ({}, {'permissions': ['a']}, {'permissions': ['a', 'b', 'c']}, {'permissions': ['a', 'b', 'b']}):
            with self.assertRaises(SystemExit): m.check_permissions(value, ['a', 'b'])

    def test_cli_rejects_apply_reset_source_and_project_overrides_before_any_io(self):
        for args in ([], ['--apply'], ['--build', '--retry'], ['--build', '--project=foreign'], ['--source=main']):
            with patch.object(m.sys, 'argv', ['candidate.py', *args]), self.assertRaisesRegex(SystemExit, 'USAGE_BUILD_OR_STATUS_ONLY'):
                m.main()


if __name__ == '__main__':
    unittest.main()
