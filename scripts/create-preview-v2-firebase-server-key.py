#!/usr/bin/env python3
"""Create one API-restricted Preview server key without retrieving its value."""
import datetime
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ORGANIZATION = '594049370623'
ACCOUNT = 'haifawi30@gmail.com'
KEY_ID = 'khedmah-preview-v2-firebase-server'
KEY_PARENT = 'projects/' + NUMBER + '/locations/global'
KEY_NAME = KEY_PARENT + '/keys/' + KEY_ID
DISPLAY_NAME = 'Khedmah Preview V2 Firebase Server'
SERVICE = 'identitytoolkit.googleapis.com'
SECRET = 'FIREBASE_API_KEY'
ROOT = 'https://apikeys.googleapis.com/v2/'
KEY_FIELDS = 'name,uid,displayName,restrictions,deleteTime,serviceAccountEmail,etag'
OP_FIELDS = 'name,done,error(code)'
SOURCE_COMMIT = '2980905168e2bb3149cd64b35bdad39ba7af68e2'
BROWSER_ID = 'fdae1cd2-64ce-49ec-a426-ed46120083e9'
MAPS_ID = 'khedmah-preview-v2-maps-browser'
MAPS_UID = '6fad46fb-229e-403e-8f60-530b4ab9c1ae'
ORIGIN = 'https://khedmah-pr-274-frontend-1044962071847.europe-west1.run.app'
AUTH_ORIGIN = 'https://' + PROJECT + '.firebaseapp.com'
BROWSER_SERVICES = {
    'firebasedatabase.googleapis.com', 'firebasehosting.googleapis.com',
    'firebaserules.googleapis.com', 'sqladmin.googleapis.com', 'cloudconfig.googleapis.com',
    'datastore.googleapis.com', 'fcmregistrations.googleapis.com', 'firebase.googleapis.com',
    'firebaseappcheck.googleapis.com', 'firebaseappdistribution.googleapis.com',
    'firebaseapphosting.googleapis.com', 'firebaseapptesters.googleapis.com',
    'firebasedataconnect.googleapis.com', 'firebaseinappmessaging.googleapis.com',
    'firebaseinstallations.googleapis.com', 'firebaseml.googleapis.com',
    'firebaseremoteconfig.googleapis.com', 'firebaseremoteconfigrealtime.googleapis.com',
    'firebasestorage.googleapis.com', 'firebasevertexai.googleapis.com',
    'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'logging.googleapis.com',
    'mlkit.googleapis.com', 'play.googleapis.com', 'securetoken.googleapis.com',
    'fpnv.googleapis.com',
}


def stop(code):
    raise SystemExit('STOP: ' + code)


def emit(stage, **fields):
    print(json.dumps(dict(stage=stage, **fields), sort_keys=True), flush=True)


def cloud(*args, fields=None):
    command = ['gcloud', *args, '--project=' + PROJECT, '--account=' + ACCOUNT,
               '--user-output-enabled', '--verbosity=error']
    if fields is not None:
        command.append('--format=json(' + fields + ')')
    env = {k: v for k, v in os.environ.items() if k not in ('DEBUG', 'GH_DEBUG')}
    env.update(CLOUDSDK_CORE_DISABLE_PROMPTS='true', CLOUDSDK_CORE_LOG_HTTP='false',
               CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true', CLOUDSDK_CORE_UNIVERSE_DOMAIN='googleapis.com')
    try:
        result = subprocess.run(command, input=b'', capture_output=True, timeout=60, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop('METADATA_READ_UNCONFIRMED')
    # No raw stdout/stderr or exception text: these may contain credentials.
    if result.returncode or len(result.stdout) > 1048576:
        stop('METADATA_READ_FAILED_OR_TOO_LARGE')
    if fields is None:
        return result.stdout.strip()
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop('METADATA_RESPONSE_INVALID')


def preflight():
    if any(os.environ.get(key) for key in (
            'CLOUDSDK_AUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT',
            'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE')):
        stop('AUTH_OVERRIDE_PRESENT')
    if any(k.startswith('CLOUDSDK_API_ENDPOINT_OVERRIDES_') and v for k, v in os.environ.items()):
        stop('API_ENDPOINT_OVERRIDE_PRESENT')
    for key in ('impersonate_service_account', 'access_token_file', 'credential_file_override'):
        if cloud('config', 'get-value', 'auth/' + key) not in (b'', b'(unset)'):
            stop('AUTH_OVERRIDE_PRESENT')
    endpoints = cloud('config', 'list', 'api_endpoint_overrides/', fields='api_endpoint_overrides')
    if not isinstance(endpoints, dict) or endpoints.get('api_endpoint_overrides'):
        stop('API_ENDPOINT_OVERRIDE_PRESENT_OR_UNCONFIRMED')
    if cloud('auth', 'list', '--filter=account=' + ACCOUNT, fields='account') != [{'account': ACCOUNT}]:
        stop('EXPECTED_ACCOUNT_NOT_AVAILABLE')
    project = cloud('projects', 'describe', PROJECT,
                    fields='projectId,projectNumber,lifecycleState,parent')
    if (not isinstance(project, dict) or project.get('projectId') != PROJECT
            or str(project.get('projectNumber')) != NUMBER or project.get('lifecycleState') != 'ACTIVE'
            or project.get('parent') != {'type': 'organization', 'id': ORGANIZATION}):
        stop('PROJECT_IDENTITY_MISMATCH')
    services = cloud('services', 'list', '--enabled', fields='config.name')
    if (not isinstance(services, list) or any(not isinstance(x, dict)
            or not isinstance(x.get('config'), dict) or not isinstance(x['config'].get('name'), str)
            for x in services)):
        stop('SERVICE_INVENTORY_INVALID')
    if not {'apikeys.googleapis.com', SERVICE, 'secretmanager.googleapis.com'} <= {
            x['config']['name'] for x in services}:
        stop('REQUIRED_API_NOT_ENABLED_NO_AUTOMATIC_ENABLE')


def api_targets(restrictions):
    targets = restrictions.get('apiTargets')
    if not isinstance(targets, list) or not targets:
        stop('API_RESTRICTIONS_INVALID')
    services = []
    for target in targets:
        if (not isinstance(target, dict) or set(target) - {'service', 'methods'}
                or not isinstance(target.get('service'), str) or target.get('methods', []) != []):
            stop('API_RESTRICTIONS_INVALID')
        services.append(target['service'])
    if len(services) != len(set(services)):
        stop('DUPLICATE_API_TARGET')
    return set(services)


def validate_identity(value, name, uid=None):
    if (not isinstance(value, dict) or value.get('name') != name
            or value.get('deleteTime') or value.get('serviceAccountEmail')
            or not isinstance(value.get('uid'), str)
            or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', value['uid'])
            or (uid is not None and value['uid'] != uid)
            or not isinstance(value.get('etag'), str) or not value['etag']):
        stop('KEY_IDENTITY_CONFLICT')


def validate_server(value):
    validate_identity(value, KEY_NAME)
    restrictions = value.get('restrictions')
    if (value.get('displayName') != DISPLAY_NAME or not isinstance(restrictions, dict)
            or set(restrictions) != {'apiTargets'} or api_targets(restrictions) != {SERVICE}):
        stop('SERVER_KEY_RESTRICTIONS_CONFLICT')


def inventory():
    keys = cloud('services', 'api-keys', 'list', fields=KEY_FIELDS)
    if not isinstance(keys, list) or len(keys) not in (2, 3):
        stop('KEY_INVENTORY_CONFLICT')
    by_name = {}
    for key in keys:
        if not isinstance(key, dict) or not isinstance(key.get('name'), str) or key['name'] in by_name:
            stop('KEY_INVENTORY_INVALID')
        by_name[key['name']] = key
    browser_names = {KEY_PARENT + '/keys/' + n for n in (BROWSER_ID, MAPS_ID)}
    if set(by_name) not in (browser_names, browser_names | {KEY_NAME}):
        stop('UNEXPECTED_KEY_INVENTORY')
    snapshots = {}
    for key_id, uid, services, refs in (
            (BROWSER_ID, BROWSER_ID, BROWSER_SERVICES,
             {origin + suffix for origin in (ORIGIN, AUTH_ORIGIN) for suffix in ('', '/*')}),
            (MAPS_ID, MAPS_UID, {'maps-backend.googleapis.com'}, {ORIGIN + '/*'})):
        name = KEY_PARENT + '/keys/' + key_id
        key = by_name[name]
        validate_identity(key, name, uid)
        restrictions = key.get('restrictions')
        if not isinstance(restrictions, dict) or set(restrictions) != {'apiTargets', 'browserKeyRestrictions'}:
            stop('EXISTING_BROWSER_RESTRICTIONS_CONFLICT')
        browser = restrictions['browserKeyRestrictions']
        allowed = browser.get('allowedReferrers') if isinstance(browser, dict) else None
        if (not isinstance(browser, dict) or set(browser) != {'allowedReferrers'}
                or not isinstance(allowed, list) or any(not isinstance(x, str) for x in allowed)
                or len(allowed) != len(refs) or set(allowed) != refs or api_targets(restrictions) != services):
            stop('EXISTING_BROWSER_RESTRICTIONS_CONFLICT')
        snapshots[name] = dict(uid=uid, etag=key['etag'], services=sorted(services), referrers=sorted(refs))
    server = by_name.get(KEY_NAME)
    if server is not None:
        validate_server(server)
    secrets = cloud('secrets', 'list', fields='name')
    if not isinstance(secrets, list) or any(not isinstance(x, dict)
            or not re.fullmatch(r'projects/(?:' + NUMBER + '|' + PROJECT + r')/secrets/[A-Za-z0-9_-]+',
                               x.get('name', '')) for x in secrets):
        stop('SECRET_INVENTORY_INVALID')
    present = any(x['name'].rsplit('/', 1)[-1] == SECRET for x in secrets)
    return snapshots, server, present


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        if not isinstance(token, str) or not token or any(c.isspace() for c in token):
            stop('TOKEN_UNAVAILABLE')
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, kind, operation=None):
        body, query = None, {}
        if kind == 'create' and operation is None:
            path = KEY_PARENT + '/keys'
            query = {'keyId': KEY_ID, 'fields': OP_FIELDS}
            body = {'displayName': DISPLAY_NAME, 'restrictions': {'apiTargets': [{'service': SERVICE}]}}
        elif kind == 'key' and operation is None:
            path, query = KEY_NAME, {'fields': KEY_FIELDS}
        elif kind == 'operation' and isinstance(operation, str) and re.fullmatch(
                r'operations/[A-Za-z0-9_.-]{1,256}', operation):
            path, query = operation, {'fields': OP_FIELDS}
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
            # HTTPError is also a response stream. Close it before stopping so
            # delayed cleanup cannot emit its reason/body through ResourceWarning.
            try:
                error.close()
            except OSError:
                pass
            stop('HTTP_' + str(error.code) + '_RECONCILE_NO_BLIND_RETRY')
        except (OSError, ValueError):
            stop('REQUEST_UNCONFIRMED_RECONCILE_NO_BLIND_RETRY')


def wait_operation(client, result):
    name = result.get('name')
    if not isinstance(name, str) or not re.fullmatch(r'operations/[A-Za-z0-9_.-]{1,256}', name):
        stop('OPERATION_ID_UNCONFIRMED_RECONCILE')
    emit('PREVIEW_V2_SERVER_KEY_OPERATION', operation=name)
    for attempt in range(30):
        if result.get('name') != name or type(result.get('done', False)) is not bool:
            stop('OPERATION_METADATA_CONFLICT_RECONCILE')
        if 'error' in result:
            stop('KEY_CREATE_OPERATION_FAILED_RECONCILE')
        if result.get('done') is True:
            return
        if attempt == 29:
            stop('KEY_CREATE_PENDING_RECONCILE_NO_BLIND_RETRY')
        time.sleep(2)
        result = client.request('operation', operation=name)


def mark_attempt(directory):
    if directory.is_symlink():
        stop('ATTEMPT_DIRECTORY_REJECTED')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        stop('ATTEMPT_DIRECTORY_NOT_PRIVATE')
    try:
        fd = os.open(directory / 'create-attempt.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        stop('PREVIOUS_CREATE_ATTEMPT_RECONCILE_NO_BLIND_RETRY')
    with os.fdopen(fd, 'w') as stream:
        json.dump({'project': PROJECT, 'key_name': KEY_NAME, 'attempted': True}, stream)
        stream.flush()
        os.fsync(stream.fileno())
    # Persist directory entry as well as marker content before the first POST.
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def run(apply=False, directory=None):
    os.umask(0o077)
    preflight()
    before, server, secret_present = inventory()
    if not apply:
        emit('PREVIEW_V2_FIREBASE_SERVER_KEY_METADATA_READ', project=PROJECT,
             key_name=KEY_NAME, server_key_present=server is not None,
             server_key_restrictions_verified=server is not None,
             backend_secret_container_present=secret_present, cloud_mutation=False,
             key_payload_access=False, secret_payload_access=False,
             credential_values_printed=False, retry_authorized=False,
             application_deployed=False, floot_connected=False,
             evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
        return
    if server is not None or secret_present:
        stop('SERVER_CONFIGURATION_ALREADY_PRESENT_REVIEW_NO_OVERWRITE')
    token = cloud('auth', 'print-access-token').decode('ascii').strip()
    client = Client(token)
    # No key payload is requested, including in long-running operation responses.
    mark_attempt(directory or Path.home() / 'khedmah-preview-v2-firebase-server-key')
    fresh, server, secret_present = inventory()
    if fresh != before or server is not None or secret_present:
        stop('PREFLIGHT_CHANGED_RECONCILE_NO_MUTATION')
    emit('PREVIEW_V2_FIREBASE_SERVER_KEY_CREATE_BEGIN', project=PROJECT, key_name=KEY_NAME)
    wait_operation(client, client.request('create'))
    key = client.request('key')
    validate_server(key)
    after, server, secret_present = inventory()
    if after != before or server is None or server['uid'] != key['uid'] or secret_present:
        stop('POST_CREATE_INVENTORY_CHANGED_RECONCILE')
    emit('PREVIEW_V2_FIREBASE_SERVER_KEY_CREATED', project=PROJECT, key_name=KEY_NAME,
         key_uid=key['uid'], api_services=[SERVICE], api_restrictions_verified=True,
         existing_browser_keys_preserved=True, client_restrictions_configured=False,
         secret_container_created=False, secret_value_staged=False, iam_mutation=False,
         runtime_binding_configured=False, key_payload_access=False, secret_payload_access=False,
         credential_values_printed=False, application_deployed=False, floot_connected=False,
         server_request_acceptance_verified=False, login_flow_verified=False,
         source_commit=SOURCE_COMMIT, evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


if __name__ == '__main__':
    if sys.argv[1:] not in (['--apply'], ['--inspect']):
        stop('USE_APPLY_OR_INSPECT_ONLY_NO_CREDENTIAL_ARGUMENT')
    try:
        run(apply=sys.argv[1] == '--apply')
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError, KeyboardInterrupt):
        stop('LOCAL_OR_METADATA_FAILURE_RECONCILE_NO_BLIND_RETRY')
