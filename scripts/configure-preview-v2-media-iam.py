#!/usr/bin/env python3
"""Grant exactly three object permissions on the existing Preview media prefix.

Initial mode creates a role and binds it. Reviewed completion mode requires the
original attempt marker and an exact existing role, queries bucket grantability,
then performs one bucket-policy CAS. No role recreation or automatic retry.
"""
import copy
import datetime
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ACCOUNT = 'haifawi30@gmail.com'
ORGANIZATION = '594049370623'
SOURCE_COMMIT = '9631157d5360c4df096eb00642e4e54bea80f305'
BUCKET = PROJECT + '.firebasestorage.app'
RESOURCE = 'projects/_/buckets/' + BUCKET
RUNTIME = 'khedmah-pv2-runtime@' + PROJECT + '.iam.gserviceaccount.com'
MEMBER = 'serviceAccount:' + RUNTIME
ROLE_ID = 'khedmahPreviewMediaObjects'
ROLE_NAME = 'projects/' + PROJECT + '/roles/' + ROLE_ID
PERMISSIONS = ['storage.objects.create', 'storage.objects.delete', 'storage.objects.get']
ROLE = {'title': 'Khedmah Preview media objects',
        'description': 'Create read and delete Preview application media; bind only to its media prefix.',
        'stage': 'GA', 'includedPermissions': PERMISSIONS}
BINDING = {'role': ROLE_NAME, 'members': [MEMBER], 'condition': {
    'title': 'khedmah_preview_media_prefix',
    'description': 'Only application objects below media/ in the existing Preview bucket.',
    'expression': "resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('"
                  + RESOURCE + "/objects/media/')"}}
LEGACY = [{'role': 'roles/storage.' + role, 'members': [kind + ':' + PROJECT for kind in kinds]}
          for role, kinds in [('legacyBucketOwner', ['projectEditor', 'projectOwner']),
                              ('legacyBucketReader', ['projectViewer']),
                              ('legacyObjectOwner', ['projectEditor', 'projectOwner']),
                              ('legacyObjectReader', ['projectViewer'])]]
IAM_ROOT = 'https://iam.googleapis.com/v1/'
STORAGE_ROOT = 'https://storage.googleapis.com/storage/v1/b/' + BUCKET


def stop(code):
    raise SystemExit('STOP: ' + code)


def emit(stage, **values):
    print(json.dumps(dict(stage=stage, **values), sort_keys=True), flush=True)


def cloud(*args, fields=None):
    env = {k: v for k, v in os.environ.items() if k not in ('DEBUG', 'GH_DEBUG')}
    env.update(CLOUDSDK_CORE_DISABLE_PROMPTS='true', CLOUDSDK_CORE_LOG_HTTP='false',
               CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true', CLOUDSDK_CORE_UNIVERSE_DOMAIN='googleapis.com')
    command = ['gcloud', *args, '--project=' + PROJECT, '--account=' + ACCOUNT,
               '--user-output-enabled', '--verbosity=error']
    if fields is not None:
        command.append('--format=json(' + fields + ')')
    try:
        result = subprocess.run(command, input=b'', capture_output=True, timeout=60, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop('GCLOUD_READ_UNCONFIRMED')
    if result.returncode or len(result.stdout) > 1048576:
        stop('GCLOUD_READ_FAILED_OR_TOO_LARGE')
    return json.loads(result.stdout) if fields is not None else result.stdout.strip()


def preflight():
    if any(os.environ.get(k) for k in ('CLOUDSDK_AUTH_ACCESS_TOKEN',
            'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT', 'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE',
            'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE')):
        stop('AUTH_OVERRIDE_PRESENT')
    if any(k.startswith('CLOUDSDK_API_ENDPOINT_OVERRIDES_') and v for k, v in os.environ.items()):
        stop('ENDPOINT_OVERRIDE_PRESENT')
    for key in ('impersonate_service_account', 'access_token_file', 'credential_file_override'):
        if cloud('config', 'get-value', 'auth/' + key) not in (b'', b'(unset)'):
            stop('AUTH_OVERRIDE_PRESENT')
    endpoints = cloud('config', 'list', 'api_endpoint_overrides/', fields='api_endpoint_overrides')
    if not isinstance(endpoints, dict) or endpoints.get('api_endpoint_overrides'):
        stop('ENDPOINT_OVERRIDE_PRESENT_OR_UNCONFIRMED')
    if cloud('auth', 'list', '--filter=account=' + ACCOUNT, fields='account') != [{'account': ACCOUNT}]:
        stop('EXPECTED_ACCOUNT_UNAVAILABLE')
    project = cloud('projects', 'describe', PROJECT, fields='projectId,projectNumber,lifecycleState,parent')
    if (not isinstance(project, dict) or project.get('projectId') != PROJECT
            or str(project.get('projectNumber')) != NUMBER or project.get('lifecycleState') != 'ACTIVE'
            or project.get('parent') != {'type': 'organization', 'id': ORGANIZATION}):
        stop('PROJECT_IDENTITY_MISMATCH')


def identity_and_project_policy():
    identity = cloud('iam', 'service-accounts', 'describe', RUNTIME,
                     fields='name,email,projectId,uniqueId,disabled')
    if (not isinstance(identity, dict) or identity.get('email') != RUNTIME
            or identity.get('name') != 'projects/' + PROJECT + '/serviceAccounts/' + RUNTIME
            or identity.get('projectId') != PROJECT or identity.get('disabled', False) is not False
            or not re.fullmatch(r'[0-9]{6,30}', identity.get('uniqueId', ''))):
        stop('RUNTIME_IDENTITY_UNCONFIRMED')
    policy = cloud('projects', 'get-iam-policy', PROJECT, fields='version,etag,bindings,auditConfigs')
    if not isinstance(policy, dict) or not isinstance(policy.get('etag'), str) or not policy['etag']:
        stop('PROJECT_POLICY_UNCONFIRMED')
    selected = []
    for binding in policy.get('bindings', []):
        if not isinstance(binding, dict) or not isinstance(binding.get('members'), list):
            stop('PROJECT_BINDINGS_INVALID')
        if any(m in binding['members'] for m in ('allUsers', 'allAuthenticatedUsers')):
            stop('PUBLIC_PROJECT_BINDING_REQUIRES_REVIEW')
        if MEMBER in binding['members']:
            selected.append({k: v for k, v in binding.items() if k != 'members'})
    if selected != [{'role': 'roles/cloudsql.client'}]:
        stop('RUNTIME_PROJECT_BINDINGS_CHANGED_REVIEW')
    return identity, policy


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        if not isinstance(token, str) or not token or any(c.isspace() for c in token):
            stop('TOKEN_UNAVAILABLE')
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, kind, policy=None, page_token=None):
        body, method = None, 'GET'
        if page_token is not None and (kind != 'grantable-roles' or not isinstance(page_token, str)
                                       or not page_token or len(page_token) > 4096):
            stop('REQUEST_SCOPE_REJECTED')
        if kind == 'role' and policy is None:
            url = IAM_ROOT + ROLE_NAME
        elif kind == 'create-role' and policy is None:
            url, method = IAM_ROOT + 'projects/' + PROJECT + '/roles', 'POST'
            body = {'roleId': ROLE_ID, 'role': ROLE}
        elif kind == 'bucket' and policy is None:
            url = STORAGE_ROOT + '?fields=name,projectNumber,location,iamConfiguration'
        elif kind == 'policy' and policy is None:
            url = STORAGE_ROOT + '/iam?optionsRequestedPolicyVersion=3'
        elif kind == 'set-policy' and policy is not None:
            check_policy(policy, LEGACY)
            body = {'version': 3, 'etag': policy['etag'],
                    'bindings': copy.deepcopy(policy['bindings']) + [copy.deepcopy(BINDING)]}
            url, method = STORAGE_ROOT + '/iam', 'PUT'
        elif kind == 'grantable-roles' and policy is None:
            url, method = IAM_ROOT + 'roles:queryGrantableRoles', 'POST'
            body = {'fullResourceName': '//storage.googleapis.com/' + RESOURCE,
                    'view': 'BASIC', 'pageSize': 200}
            if page_token is not None:
                body['pageToken'] = page_token
        else:
            stop('REQUEST_SCOPE_REJECTED')
        request = urllib.request.Request(url, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + self.token, 'x-goog-user-project': PROJECT,
                     'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=45) as response:
                raw = response.read(1048577)
            if len(raw) > 1048576:
                stop('RESPONSE_TOO_LARGE_RECONCILE')
            value = json.loads(raw)
            if not isinstance(value, dict):
                stop('INVALID_RESPONSE_RECONCILE')
            return value
        except urllib.error.HTTPError as error:
            # Absence only for an authenticated GET of this exact role; never writes/bucket reads.
            if kind == 'role' and error.code == 404:
                return None
            # Never print raw provider bodies, tokens, headers or request payloads.
            reason = 'UNCLASSIFIED'
            try:
                raw = error.read(16385)
                value = json.loads(raw) if len(raw) <= 16384 else {}
                message = value.get('error', {}).get('message')
                if message == "Role (" + ROLE_NAME + ") does not exist in the resource's hierarchy.":
                    reason = 'ROLE_NOT_IN_RESOURCE_HIERARCHY'
            except (OSError, ValueError, AttributeError, TypeError):
                pass
            emit('PREVIEW_V2_MEDIA_IAM_HTTP_FAILURE', request_kind=kind,
                 http_status=error.code, recognized_reason=reason, retry_authorized=False)
            stop('HTTP_' + str(error.code) + '_RECONCILE_NO_BLIND_RETRY')
        except (OSError, ValueError):
            stop('REQUEST_UNCONFIRMED_RECONCILE_NO_BLIND_RETRY')


def check_bucket(value):
    if (not isinstance(value, dict) or value.get('name') != BUCKET
            or str(value.get('projectNumber')) != NUMBER or value.get('location') != 'EUROPE-WEST1'):
        stop('BUCKET_IDENTITY_MISMATCH')
    iam = value.get('iamConfiguration', {})
    if (iam.get('publicAccessPrevention') != 'enforced'
            or iam.get('uniformBucketLevelAccess', {}).get('enabled') is not True):
        stop('BUCKET_PAP_OR_UBLA_UNCONFIRMED')
    return value


def canonical(bindings):
    if not isinstance(bindings, list):
        stop('POLICY_BINDINGS_INVALID')
    rows = []
    for binding in bindings:
        if (not isinstance(binding, dict) or set(binding) - {'role', 'members', 'condition'}
                or not isinstance(binding.get('role'), str) or not isinstance(binding.get('members'), list)
                or not binding['members'] or any(not isinstance(m, str) for m in binding['members'])
                or len(set(binding['members'])) != len(binding['members'])):
            stop('POLICY_BINDING_INVALID')
        rows.append(json.dumps(dict(binding, members=sorted(binding['members'])), sort_keys=True))
    return sorted(rows)


def check_policy(value, bindings):
    if (not isinstance(value, dict) or set(value) - {'etag', 'version', 'bindings', 'kind', 'resourceId'}
            or not isinstance(value.get('etag'), str) or not value['etag']
            or type(value.get('version', 1)) is not int or value.get('version', 1) not in (1, 3)
            or value.get('kind', 'storage#policy') != 'storage#policy'
            or value.get('resourceId', RESOURCE) != RESOURCE
            or canonical(value.get('bindings')) != canonical(bindings)
            or (any('condition' in b for b in bindings) and value.get('version') != 3)):
        stop('BUCKET_POLICY_CHANGED_OR_UNEXPECTED_RECONCILE')
    return value


def check_role(value):
    if (not isinstance(value, dict) or value.get('name') != ROLE_NAME
            or value.get('deleted', False) is not False
            or any(value.get(k) != v for k, v in ROLE.items() if k != 'includedPermissions')
            or sorted(value.get('includedPermissions', [])) != PERMISSIONS
            or not isinstance(value.get('etag'), str) or not value['etag']):
        stop('CUSTOM_ROLE_CONTRACT_UNCONFIRMED')
    return value


def marker(directory, filename='attempt.json'):
    if filename not in ('attempt.json', 'binding-completion-attempt.json'):
        stop('ATTEMPT_PATH_REJECTED')
    if directory.is_symlink():
        stop('ATTEMPT_PATH_REJECTED')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        stop('ATTEMPT_DIRECTORY_NOT_PRIVATE')
    try:
        fd = os.open(directory / filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        stop('PREVIOUS_MEDIA_IAM_ATTEMPT_RECONCILE_NO_BLIND_RETRY')
    with os.fdopen(fd, 'w') as stream:
        json.dump({'project': PROJECT, 'bucket': BUCKET, 'role': ROLE_NAME, 'attempted': True}, stream)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def prior_attempt(directory):
    """Read, never delete/replace, the original private attempt record."""
    if directory.is_symlink():
        stop('ORIGINAL_ATTEMPT_PATH_REJECTED')
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        stop('ORIGINAL_ATTEMPT_DIRECTORY_NOT_PRIVATE')
    fd = os.open(directory / 'attempt.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_mode & 0o077 or info.st_nlink != 1 or info.st_size > 4096):
            stop('ORIGINAL_ATTEMPT_FILE_REJECTED')
        raw = stream.read(4097)
    value = json.loads(raw)
    if (len(raw) > 4096 or value != {'project': PROJECT, 'bucket': BUCKET,
                                    'role': ROLE_NAME, 'attempted': True}
            or value.get('attempted') is not True):
        stop('ORIGINAL_ATTEMPT_RECORD_UNCONFIRMED')
    return info.st_dev, info.st_ino, raw


def require_grantable(client):
    """Read-only IAM query; paginated, bounded and fail-closed, without retries."""
    token, seen_tokens, seen_roles = None, set(), set()
    for _ in range(20):
        page = client.request('grantable-roles', page_token=token)
        roles = page.get('roles', [])
        if not isinstance(roles, list) or len(roles) > 200:
            stop('GRANTABLE_ROLES_RESPONSE_UNCONFIRMED')
        for role in roles:
            name = role.get('name') if isinstance(role, dict) else None
            if not isinstance(name, str) or not name or name in seen_roles:
                stop('GRANTABLE_ROLES_RESPONSE_UNCONFIRMED')
            seen_roles.add(name)
        token = page.get('nextPageToken', '')
        if not isinstance(token, str) or len(token) > 4096 or token in seen_tokens:
            stop('GRANTABLE_ROLES_PAGINATION_UNCONFIRMED')
        if not token:
            if ROLE_NAME not in seen_roles:
                stop('EXISTING_ROLE_NOT_GRANTABLE_ON_BUCKET_NO_MUTATION')
            return
        seen_tokens.add(token)
    stop('GRANTABLE_ROLES_PAGE_LIMIT_NO_MUTATION')


def complete_binding(directory):
    """Complete only the reconciled 2026-10-14 role-present/binding-absent state."""
    preflight()
    original_marker = prior_attempt(directory)
    identities = identity_and_project_policy()
    client = Client(cloud('auth', 'print-access-token').decode('ascii').strip())
    bucket = check_bucket(client.request('bucket'))
    role = check_role(client.request('role'))
    policy = check_policy(client.request('policy'), LEGACY)
    require_grantable(client)
    marker(directory, 'binding-completion-attempt.json')
    # No custom-role write in this mode. Recheck every guard after journaling.
    preflight()
    require_grantable(client)
    if (prior_attempt(directory) != original_marker or identity_and_project_policy() != identities
            or check_bucket(client.request('bucket')) != bucket
            or check_role(client.request('role')) != role or client.request('policy') != policy):
        stop('COMPLETION_PREFLIGHT_CHANGED_NO_MUTATION')
    emit('PREVIEW_V2_MEDIA_BINDING_COMPLETION_PREFLIGHT_PASSED', project=PROJECT,
         existing_role_contract_verified=True, role_grantable_on_bucket=True)
    check_policy(client.request('set-policy', policy=policy), LEGACY + [BINDING])
    check_policy(client.request('policy'), LEGACY + [BINDING])
    if (check_role(client.request('role')) != role or identity_and_project_policy() != identities
            or check_bucket(client.request('bucket')) != bucket
            or prior_attempt(directory) != original_marker):
        stop('COMPLETION_POST_GRANT_STATE_CHANGED_RECONCILE')
    emit('PREVIEW_V2_MEDIA_BINDING_COMPLETION_VERIFIED', project=PROJECT, bucket=BUCKET,
         role=ROLE_NAME, runtime_service_account=RUNTIME, permissions=PERMISSIONS,
         object_prefix='media/', existing_role_unchanged=True, custom_role_created=False,
         original_attempt_marker_preserved=True, role_grantable_on_bucket=True,
         direct_conditional_binding_verified=True, legacy_bindings_preserved=True,
         project_policy_unchanged=True, public_access_prevention='enforced',
         uniform_bucket_level_access=True, cloud_iam_mutation=True,
         bucket_configuration_mutation=False, secret_payload_access=False,
         object_data_access=False, credential_values_printed=False,
         firebase_rules_mutation=False, full_effective_iam_verified=False,
         runtime_storage_access_verified=False, runtime_binding_configured=False,
         application_deployed=False, floot_connected=False, source_commit=SOURCE_COMMIT,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


def run(apply=False, directory=None, complete=False):
    os.umask(0o077)
    if complete:
        if apply:
            stop('MODE_CONFLICT')
        return complete_binding(directory or Path.home() / 'khedmah-preview-v2-media-iam')
    preflight()
    identities = identity_and_project_policy()
    client = Client(cloud('auth', 'print-access-token').decode('ascii').strip())
    bucket = check_bucket(client.request('bucket'))
    role = client.request('role')
    policy = client.request('policy')
    if not apply:
        if role is not None:
            check_role(role)
        applied = canonical(policy.get('bindings')) == canonical(LEGACY + [BINDING])
        check_policy(policy, LEGACY + [BINDING] if applied else LEGACY)
        emit('PREVIEW_V2_MEDIA_IAM_RECONCILIATION_READ', project=PROJECT, bucket=BUCKET,
             custom_role_present=role is not None, expected_direct_binding_present=applied,
             retry_authorized=False, cloud_mutation=False, secret_payload_access=False,
             object_data_access=False, credential_values_printed=False,
             full_effective_iam_verified=False, runtime_storage_access_verified=False,
             application_deployed=False, floot_connected=False,
             evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
        return
    if role is not None:
        stop('CUSTOM_ROLE_ALREADY_EXISTS_NO_ADOPTION_OR_RETRY')
    check_policy(policy, LEGACY)
    marker(directory or Path.home() / 'khedmah-preview-v2-media-iam')
    if (identity_and_project_policy() != identities or check_bucket(client.request('bucket')) != bucket
            or client.request('role') is not None or client.request('policy') != policy):
        stop('PREFLIGHT_CHANGED_NO_MUTATION')
    emit('PREVIEW_V2_MEDIA_IAM_PREFLIGHT_PASSED', project=PROJECT, bucket=BUCKET)
    created = check_role(client.request('create-role'))
    if check_role(client.request('role')) != created:
        stop('CREATED_ROLE_CHANGED_RECONCILE')
    # Fresh checks after role creation, and etag CAS on the only bucket-policy write.
    if (identity_and_project_policy() != identities or check_bucket(client.request('bucket')) != bucket
            or client.request('policy') != policy):
        stop('PRE_BINDING_STATE_CHANGED_RECONCILE')
    check_policy(client.request('set-policy', policy=policy), LEGACY + [BINDING])
    check_policy(client.request('policy'), LEGACY + [BINDING])
    if (check_role(client.request('role')) != created or identity_and_project_policy() != identities
            or check_bucket(client.request('bucket')) != bucket):
        stop('POST_GRANT_STATE_CHANGED_RECONCILE')
    emit('PREVIEW_V2_MEDIA_IAM_CONFIGURED', project=PROJECT, bucket=BUCKET, role=ROLE_NAME,
         runtime_service_account=RUNTIME, permissions=PERMISSIONS, object_prefix='media/',
         custom_role_created=True, direct_conditional_binding_verified=True,
         legacy_bindings_preserved=True, project_policy_unchanged=True,
         public_access_prevention='enforced', uniform_bucket_level_access=True,
         cloud_iam_mutation=True, bucket_configuration_mutation=False,
         secret_payload_access=False, object_data_access=False, credential_values_printed=False,
         firebase_rules_mutation=False, full_effective_iam_verified=False,
         runtime_storage_access_verified=False, runtime_binding_configured=False,
         application_deployed=False, floot_connected=False, source_commit=SOURCE_COMMIT,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


if __name__ == '__main__':
    if sys.argv[1:] not in (['--apply'], ['--inspect'], ['--complete-binding']):
        stop('USE_APPLY_INSPECT_OR_COMPLETE_BINDING_ONLY')
    try:
        run(apply=sys.argv[1] == '--apply', complete=sys.argv[1] == '--complete-binding')
    except (OSError, ValueError, TypeError, KeyError, AttributeError, KeyboardInterrupt):
        stop('LOCAL_OR_METADATA_FAILURE_RECONCILE_NO_BLIND_RETRY')
