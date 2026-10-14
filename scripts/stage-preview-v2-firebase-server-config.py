#!/usr/bin/env python3
"""Stage the existing Preview server key and two direct secret IAM bindings once."""
import base64
import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import types
import urllib.error
import urllib.parse
import urllib.request

REPO = 'khedma-sy/khedmah-digital-v1'
SOURCE_COMMIT = '8fc90fa943e3534d66915fc0912fcd0d112f110d'
SOURCE_BLOB = 'd3bd45963240d38aeb47325f05b9181e64df1064'
SOURCE_SHA256 = 'e24eb00ff72936d23d736c8b9ec778af1498af6a4edd9cd63bba7f2e9c8df9a4'
PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
KEY_UID = '7b8dabee-f3ce-4392-b1f4-ac13e208fd1e'
SECRET = 'FIREBASE_API_KEY'
PARENT = 'projects/' + NUMBER
NAME = PARENT + '/secrets/' + SECRET
VERSION = NAME + '/versions/1'
ROOT = 'https://secretmanager.googleapis.com/v1/'
LABELS = {'application': 'khedmah', 'environment': 'preview'}
SECRET_FIELDS = 'name,replication,labels,etag,createTime,rotation,expireTime,ttl,topics,versionAliases'
VERSION_FIELDS = 'name,state,clientSpecifiedPayloadChecksum'
ACCOUNTS = {role: 'khedmah-pv2-' + role + '@' + PROJECT + '.iam.gserviceaccount.com'
            for role in ('runtime', 'deployer')}
BINDINGS = [
    {'role': 'roles/secretmanager.secretAccessor', 'members': ['serviceAccount:' + ACCOUNTS['runtime']]},
    {'role': 'roles/secretmanager.viewer', 'members': ['serviceAccount:' + ACCOUNTS['deployer']]},
]


def stop(code):
    raise SystemExit('STOP: ' + code)


def emit(stage, **fields):
    print(json.dumps(dict(stage=stage, **fields), sort_keys=True), flush=True)


def load_source():
    env = {k: v for k, v in os.environ.items() if k not in ('GH_DEBUG', 'DEBUG')}
    result = subprocess.run(['gh', 'api', '--hostname', 'github.com',
        'repos/' + REPO + '/git/blobs/' + SOURCE_BLOB], capture_output=True, timeout=60, env=env)
    if result.returncode or len(result.stdout) > 131072:
        stop('PINNED_SOURCE_READ_FAILED')
    value = json.loads(result.stdout)
    if value.get('sha') != SOURCE_BLOB or value.get('encoding') != 'base64':
        stop('PINNED_SOURCE_INVALID')
    data = base64.b64decode(''.join(value['content'].split()), validate=True)
    if (value.get('size') != len(data) or hashlib.sha256(data).hexdigest() != SOURCE_SHA256
            or hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != SOURCE_BLOB):
        stop('PINNED_SOURCE_CHECKSUM_MISMATCH')
    module = types.ModuleType('verified_server_key_metadata')
    exec(compile(data, '<verified-server-key-metadata>', 'exec'), module.__dict__)
    return module


def snapshot(source, present):
    browsers, key, secret_present = source.inventory()
    if key is None or key['uid'] != KEY_UID:
        stop('OWNER_VERIFIED_SERVER_KEY_IDENTITY_MISMATCH')
    if secret_present is not present:
        stop('SECRET_PRESENCE_CHANGED_OR_ALREADY_EXISTS_NO_OVERWRITE')
    identities = {}
    for role, email in ACCOUNTS.items():
        account = source.cloud('iam', 'service-accounts', 'describe', email,
            fields='name,email,uniqueId,projectId,disabled')
        if (not isinstance(account, dict) or account.get('email') != email
                or account.get('projectId') != PROJECT or account.get('disabled', False) is not False
                or not re.fullmatch(r'[0-9]{6,30}', account.get('uniqueId', ''))
                or account.get('name') != 'projects/' + PROJECT + '/serviceAccounts/' + email):
            stop('EXISTING_SERVICE_ACCOUNT_IDENTITY_UNCONFIRMED')
        identities[role] = account
    return browsers, key, identities


def validate_secret(value):
    if (not isinstance(value, dict) or value.get('name') != NAME
            or value.get('replication') != {'automatic': {}} or value.get('labels') != LABELS
            or not isinstance(value.get('etag'), str) or not value['etag']
            or not isinstance(value.get('createTime'), str) or not value['createTime']
            or any(value.get(k) for k in ('rotation', 'expireTime', 'ttl', 'topics', 'versionAliases'))):
        stop('SECRET_CONTAINER_CONFIGURATION_CONFLICT_RECONCILE')
    return value


def policy_bindings(value):
    if (not isinstance(value, dict) or set(value) - {'etag', 'version', 'bindings'}
            or type(value.get('version', 0)) is not int or value.get('version', 0) not in (0, 1, 3)
            or not isinstance(value.get('etag'), str) or not value['etag']
            or not isinstance(value.get('bindings', []), list)):
        stop('DIRECT_SECRET_POLICY_UNCONFIRMED')
    rows = []
    for binding in value.get('bindings', []):
        if (not isinstance(binding, dict) or set(binding) != {'role', 'members'}
                or not isinstance(binding['role'], str) or not isinstance(binding['members'], list)
                or not binding['members'] or any(not isinstance(x, str) for x in binding['members'])
                or len(set(binding['members'])) != len(binding['members'])):
            stop('DIRECT_SECRET_POLICY_CONFLICT')
        rows.append((binding['role'], tuple(sorted(binding['members']))))
    return sorted(rows)


def check_policy(value, expected):
    wanted = sorted((b['role'], tuple(b['members'])) for b in expected)
    if policy_bindings(value) != wanted:
        stop('UNEXPECTED_DIRECT_SECRET_BINDINGS_NO_OVERWRITE')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        if not isinstance(token, str) or not token or any(c.isspace() for c in token):
            stop('TOKEN_UNAVAILABLE')
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, kind, payload=None, etag=None):
        body, query = None, {}
        if kind == 'create' and payload is None and etag is None:
            path = PARENT + '/secrets'
            query = {'secretId': SECRET, 'fields': SECRET_FIELDS}
            body = {'replication': {'automatic': {}}, 'labels': LABELS}
        elif kind == 'set-policy' and payload is None and isinstance(etag, str) and etag:
            path = NAME + ':setIamPolicy'
            body = {'policy': {'version': 3, 'etag': etag, 'bindings': BINDINGS},
                    'updateMask': 'bindings,etag'}
        elif kind == 'add-version' and isinstance(payload, bytes) and etag is None:
            if not re.fullmatch(rb'AIza[0-9A-Za-z_-]{35}', payload):
                stop('KEY_PAYLOAD_INVALID_NO_WRITE')
            path, query = NAME + ':addVersion', {'fields': VERSION_FIELDS}
            body = {'payload': {'data': base64.b64encode(payload).decode('ascii'),
                                'dataCrc32c': str(crc32c(payload))}}
        elif payload is None and etag is None and kind in ('secret', 'policy', 'versions', 'access'):
            path, query = {
                'secret': (NAME, {'fields': SECRET_FIELDS}),
                'policy': (NAME + ':getIamPolicy', {'options.requestedPolicyVersion': '3'}),
                'versions': (NAME + '/versions', {'pageSize': '100', 'fields': 'versions(name,state),nextPageToken'}),
                'access': (VERSION + ':access', {'fields': 'name,payload(data,dataCrc32c)'}),
            }[kind]
        else:
            stop('REQUEST_SCOPE_REJECTED')
        request = urllib.request.Request(ROOT + path + '?' + urllib.parse.urlencode(query),
            data=json.dumps(body).encode() if body is not None else None,
            method='POST' if body is not None else 'GET',
            headers={'Authorization': 'Bearer ' + self.token, 'x-goog-user-project': PROJECT,
                     'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=45) as response:
                raw = response.read(65537)
            if len(raw) > 65536:
                stop('RESPONSE_TOO_LARGE_RECONCILE')
            value = json.loads(raw)
            if not isinstance(value, dict):
                stop('RESPONSE_INVALID_RECONCILE')
            return value
        except urllib.error.HTTPError as error:
            stop('HTTP_' + str(error.code) + '_RECONCILE_NO_BLIND_RETRY')
        except (OSError, ValueError):
            stop('REQUEST_UNCONFIRMED_RECONCILE_NO_BLIND_RETRY')


def crc32c(data):
    result = 0xffffffff
    for byte in data:
        result ^= byte
        for _ in range(8):
            result = (result >> 1) ^ (0x82f63b78 if result & 1 else 0)
    return result ^ 0xffffffff


def versions(client, expected):
    value = client.request('versions')
    if value.get('nextPageToken') or value.get('versions', []) != expected:
        stop('SECRET_VERSION_INVENTORY_CONFLICT_RECONCILE')


def marker(directory):
    if directory.is_symlink():
        stop('ATTEMPT_PATH_REJECTED')
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        stop('ATTEMPT_DIRECTORY_NOT_PRIVATE')
    try:
        fd = os.open(directory / 'stage-attempt.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        stop('PREVIOUS_STAGING_ATTEMPT_RECONCILE_NO_BLIND_RETRY')
    with os.fdopen(fd, 'w') as stream:
        json.dump({'project': PROJECT, 'secret': SECRET, 'key_uid': KEY_UID, 'attempted': True}, stream)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def inspect(source):
    # Metadata only; this mode never retrieves a token, key string or secret payload.
    _, key, present = source.inventory()
    if key is None or key['uid'] != KEY_UID:
        stop('OWNER_VERIFIED_SERVER_KEY_IDENTITY_MISMATCH')
    exact, items = False, []
    if present:
        validate_secret(source.cloud('secrets', 'describe', SECRET, fields=SECRET_FIELDS))
        items = source.cloud('secrets', 'versions', 'list', SECRET, fields='name,state')
        if (not isinstance(items, list) or any(not isinstance(x, dict)
                or not re.fullmatch(re.escape(NAME) + r'/versions/[1-9][0-9]*', x.get('name', ''))
                or x.get('state') not in ('ENABLED', 'DISABLED', 'DESTROYED') for x in items)):
            stop('SECRET_VERSION_METADATA_INVALID')
        policy = source.cloud('secrets', 'get-iam-policy', SECRET, fields='etag,version,bindings')
        exact = policy_bindings(policy) == sorted((b['role'], tuple(b['members'])) for b in BINDINGS)
    emit('PREVIEW_V2_FIREBASE_SERVER_CONFIG_METADATA_READ', project=PROJECT, secret=SECRET,
         key_uid=KEY_UID, secret_container_present=present, versions=items,
         expected_direct_secret_bindings_present=exact, cloud_mutation=False,
         key_payload_access=False, secret_payload_access=False, value_verified=False,
         credential_values_printed=False, full_effective_iam_verified=False,
         runtime_secret_access_verified=False, retry_authorized=False,
         application_deployed=False, floot_connected=False,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


def run(apply=False, directory=None, source=None):
    os.umask(0o077)
    source = source or load_source()
    source.preflight()
    if not apply:
        inspect(source)
        return
    before = snapshot(source, False)
    client = Client(source.cloud('auth', 'print-access-token').decode('ascii').strip())
    marker(directory or Path.home() / 'khedmah-preview-v2-firebase-server-config')
    if snapshot(source, False) != before:
        stop('PREFLIGHT_CHANGED_NO_MUTATION')
    emit('PREVIEW_V2_FIREBASE_SERVER_CONFIG_PREFLIGHT_PASSED', project=PROJECT, secret=SECRET)
    created = validate_secret(client.request('create'))
    if validate_secret(client.request('secret')) != created:
        stop('CREATED_SECRET_CHANGED_RECONCILE')
    versions(client, [])
    policy = check_policy(client.request('policy'), [])
    # Only this newly created secret, with an etag compare-and-set; never project IAM.
    check_policy(client.request('set-policy', etag=policy['etag']), BINDINGS)
    applied_policy = check_policy(client.request('policy'), BINDINGS)
    if snapshot(source, True) != before:
        stop('KEY_OR_ACCOUNT_CHANGED_BEFORE_PAYLOAD_READ')
    value = source.cloud('services', 'api-keys', 'get-key-string', source.KEY_NAME, fields='keyString')
    key = value.get('keyString') if isinstance(value, dict) else None
    if not isinstance(key, str) or not re.fullmatch(r'AIza[0-9A-Za-z_-]{35}', key):
        stop('KEY_PAYLOAD_INVALID_NO_WRITE')
    key = key.encode('ascii')
    if snapshot(source, True) != before or validate_secret(client.request('secret')) != created:
        stop('CONFIGURATION_CHANGED_BEFORE_VERSION_WRITE')
    versions(client, [])
    if check_policy(client.request('policy'), BINDINGS) != applied_policy:
        stop('SECRET_POLICY_CHANGED_BEFORE_VERSION_WRITE')
    # addVersion has no CAS. Owner must serialize writers; never retry an uncertain POST.
    receipt = client.request('add-version', payload=key)
    if (receipt.get('name') != VERSION or receipt.get('state') != 'ENABLED'
            or receipt.get('clientSpecifiedPayloadChecksum') is not True):
        stop('VERSION_ONE_CREATION_UNCONFIRMED_RECONCILE')
    versions(client, [{'name': VERSION, 'state': 'ENABLED'}])
    readback = client.request('access')
    if readback.get('name') != VERSION or not isinstance(readback.get('payload'), dict):
        stop('SECRET_PAYLOAD_READBACK_INVALID')
    payload = readback['payload']
    actual = base64.b64decode(payload.get('data', ''), validate=True)
    if (str(payload.get('dataCrc32c')) != str(crc32c(actual)) or not hmac.compare_digest(actual, key)):
        stop('SECRET_VALUE_OR_CHECKSUM_MISMATCH_NO_OVERWRITE')
    if (snapshot(source, True) != before or validate_secret(client.request('secret')) != created
            or check_policy(client.request('policy'), BINDINGS) != applied_policy):
        stop('POST_STAGING_CONFIGURATION_CHANGED_RECONCILE')
    versions(client, [{'name': VERSION, 'state': 'ENABLED'}])
    emit('PREVIEW_V2_FIREBASE_SERVER_CONFIG_STAGED', project=PROJECT, secret=SECRET, version='1',
         key_uid=KEY_UID, key_restrictions_verified=True, existing_browser_keys_preserved=True,
         secret_container_created=True, secret_value_staged=True, value_verified=True,
         payload_checksum_verified=True, direct_secret_iam_verified=True, iam_mutation=True,
         runtime_accessor_configured=True, deployer_metadata_viewer_configured=True,
         full_effective_iam_verified=False, runtime_secret_access_verified=False,
         key_payload_access=True, secret_payload_access=True, credential_values_printed=False,
         runtime_binding_configured=False, server_request_acceptance_verified=False,
         login_flow_verified=False, application_deployed=False, floot_connected=False,
         source_commit=SOURCE_COMMIT, evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


if __name__ == '__main__':
    if sys.argv[1:] not in (['--apply'], ['--inspect']):
        stop('USE_APPLY_OR_INSPECT_ONLY_NO_CREDENTIAL_ARGUMENT')
    try:
        run(apply=sys.argv[1] == '--apply')
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError, KeyboardInterrupt,
            subprocess.TimeoutExpired):
        stop('LOCAL_OR_METADATA_FAILURE_RECONCILE_NO_BLIND_RETRY')
