#!/usr/bin/env python3
"""Grant the Preview deployer bucket metadata read on the exact build-source bucket."""
import argparse
import datetime
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ORGANIZATION = '594049370623'
ACCOUNT = 'haifawi30@gmail.com'
BUCKET = PROJECT + '-cloudbuild-source'
DEPLOYER = 'khedmah-pv2-deployer@' + PROJECT + '.iam.gserviceaccount.com'
BUILD = 'khedmah-pv2-build@' + PROJECT + '.iam.gserviceaccount.com'
MEMBER = 'serviceAccount:' + DEPLOYER
ROLE = 'roles/storage.bucketViewer'
EXPECTED = {
    ('roles/storage.objectAdmin', 'serviceAccount:' + DEPLOYER),
    ('roles/storage.objectViewer', 'serviceAccount:' + BUILD),
}
MARKER_VALUE = {'project': PROJECT, 'bucket': BUCKET, 'member': MEMBER, 'role': ROLE,
                'operation': 'build-source-metadata-grant'}


def stop(code):
    raise SystemExit('STOP: ' + code)


def emit(stage, **values):
    print(json.dumps(dict(stage=stage, **values), sort_keys=True), flush=True)


def cloud(*args, json_output=True):
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS='true', CLOUDSDK_CORE_LOG_HTTP='false',
               CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true', CLOUDSDK_CORE_PROJECT=PROJECT, LC_ALL='C')
    predefined = args[:3] == ('iam', 'roles', 'describe')
    if predefined:
        env.pop('CLOUDSDK_CORE_PROJECT', None)
    scope = '--billing-project=' + PROJECT if predefined else '--project=' + PROJECT
    command = ['gcloud', *args, scope, '--account=' + ACCOUNT,
               '--user-output-enabled', '--verbosity=error']
    if json_output:
        command.append('--format=json')
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, timeout=60, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop('GCLOUD_OPERATION_UNCONFIRMED')
    if result.returncode:
        stop('GCLOUD_OPERATION_FAILED_RECONCILE_NO_BLIND_RETRY')
    if not json_output:
        return result.stdout.strip()
    if len(result.stdout) > 2 * 1024 * 1024:
        stop('METADATA_RESPONSE_TOO_LARGE')
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop('INVALID_METADATA_RESPONSE')


def preflight():
    overrides = ('CLOUDSDK_AUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE',
                 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT')
    if any(os.environ.get(key) for key in overrides):
        stop('AUTH_OVERRIDE_PRESENT')
    project = cloud('projects', 'describe', PROJECT)
    if (project.get('projectId') != PROJECT or str(project.get('projectNumber')) != NUMBER
            or project.get('lifecycleState') != 'ACTIVE'
            or project.get('parent') != {'id': ORGANIZATION, 'type': 'organization'}):
        stop('PROJECT_IDENTITY_MISMATCH')
    bucket = cloud('storage', 'buckets', 'describe', 'gs://' + BUCKET, '--raw')
    iam = bucket.get('iamConfiguration', {})
    if (bucket.get('name') != BUCKET or str(bucket.get('projectNumber')) != NUMBER
            or bucket.get('location') != 'EUROPE-WEST1'
            or iam.get('publicAccessPrevention') != 'enforced'
            or not iam.get('uniformBucketLevelAccess', {}).get('enabled')):
        stop('BUCKET_IDENTITY_OR_PROTECTION_MISMATCH')
    role = cloud('iam', 'roles', 'describe', ROLE)
    if role.get('name') != ROLE or sorted(role.get('includedPermissions', [])) != [
            'storage.buckets.get', 'storage.buckets.list']:
        stop('BUCKET_VIEWER_ROLE_CONTRACT_CHANGED')
    return bucket


def policy_state(policy):
    if not isinstance(policy, dict) or not isinstance(policy.get('bindings'), list):
        stop('BUCKET_POLICY_INVALID')
    if not isinstance(policy.get('etag'), str) or not policy['etag']:
        stop('BUCKET_POLICY_ETAG_MISSING')
    observed, desired_count = set(), 0
    for binding in policy['bindings']:
        if not isinstance(binding, dict) or not isinstance(binding.get('members'), list):
            stop('BUCKET_POLICY_BINDING_INVALID')
        if any(member in ('allUsers', 'allAuthenticatedUsers') for member in binding['members']):
            stop('PUBLIC_BUCKET_BINDING_REQUIRES_REVIEW')
        for member in binding['members']:
            if member in {MEMBER, 'serviceAccount:' + BUILD}:
                observed.add((binding.get('role'), member))
        if binding.get('role') == ROLE:
            desired_count += binding['members'].count(MEMBER)
    if not EXPECTED.issubset(observed):
        stop('SOURCE_BUCKET_BASELINE_BINDINGS_CHANGED')
    if desired_count not in (0, 1):
        stop('SOURCE_BUCKET_METADATA_BINDING_AMBIGUOUS')
    return desired_count == 1


def create_marker(directory):
    if directory.is_symlink():
        stop('ATTEMPT_PATH_REJECTED')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        stop('ATTEMPT_DIRECTORY_NOT_PRIVATE')
    try:
        fd = os.open(directory / 'attempt.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        stop('PREVIOUS_BUILD_SOURCE_GRANT_ATTEMPT_RECONCILE_NO_BLIND_RETRY')
    with os.fdopen(fd, 'w') as stream:
        json.dump(MARKER_VALUE, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())


def inspect():
    preflight()
    policy = cloud('storage', 'buckets', 'get-iam-policy', 'gs://' + BUCKET)
    configured = policy_state(policy)
    emit('PREVIEW_V2_BUILD_SOURCE_METADATA_GRANT_READ', project=PROJECT, bucket=BUCKET,
         role=ROLE, member=MEMBER, configured=configured, cloud_mutation=False,
         retry_authorized=False, application_deployed=False,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


def apply(directory):
    bucket = preflight()
    policy = cloud('storage', 'buckets', 'get-iam-policy', 'gs://' + BUCKET)
    if policy_state(policy):
        stop('BUILD_SOURCE_METADATA_GRANT_ALREADY_PRESENT_NO_MUTATION')
    create_marker(directory)
    if preflight() != bucket:
        stop('PREFLIGHT_CHANGED_NO_MUTATION')
    fresh = cloud('storage', 'buckets', 'get-iam-policy', 'gs://' + BUCKET)
    if fresh != policy or policy_state(fresh):
        stop('BUCKET_POLICY_CHANGED_NO_MUTATION')
    updated = json.loads(json.dumps(fresh))
    updated['bindings'].append({'role': ROLE, 'members': [MEMBER]})
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix='khedmah-source-policy-',
                                     suffix='.json', delete=False) as stream:
        path = Path(stream.name)
        os.chmod(path, 0o600)
        json.dump(updated, stream, sort_keys=True)
    try:
        emit('PREVIEW_V2_BUILD_SOURCE_METADATA_GRANT_PREFLIGHT_PASSED', project=PROJECT,
             bucket=BUCKET, role=ROLE)
        cloud('storage', 'buckets', 'set-iam-policy', 'gs://' + BUCKET, str(path))
    finally:
        path.unlink(missing_ok=True)
    readback = cloud('storage', 'buckets', 'get-iam-policy', 'gs://' + BUCKET)
    if not policy_state(readback):
        stop('GRANT_READBACK_UNCONFIRMED_NO_RETRY')
    emit('PREVIEW_V2_BUILD_SOURCE_METADATA_GRANT_VERIFIED', project=PROJECT, bucket=BUCKET,
         role=ROLE, member=MEMBER, permissions=['storage.buckets.get', 'storage.buckets.list'],
         prior_object_bindings_preserved=True, public_access_prevention='enforced',
         uniform_bucket_level_access=True, cloud_iam_mutation=True,
         object_data_access=False, secret_payload_access=False, credential_values_printed=False,
         application_deployed=False, rollout_retried=False,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--inspect', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    apply(Path.home() / '.khedmah-preview-v2-build-source-grant') if args.apply else inspect()
