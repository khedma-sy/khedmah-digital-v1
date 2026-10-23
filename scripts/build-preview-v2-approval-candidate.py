#!/usr/bin/env python3
"""Build one pinned Preview backend image; never deploy or access the database.

--build records an exclusive durable intent, uploads one generation-pinned source
object, and submits once. --status and --diagnose only read Google metadata. An interrupted or
ambiguous attempt is never retried, reset, deleted, or replaced by this program.
The frozen reader supplies owner/project preflight only, never secret/SQL code.
"""
import base64
import datetime
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ACCOUNT = 'haifawi30@gmail.com'
REGION = 'europe-west1'
REPO = 'khedma-sy/khedmah-digital-v1'
# Updated only in reviewed source preparation, never through CLI/environment.
SOURCE_COMMIT = 'ecd3ad8a16cd9820c599f16e75b1acf3e5a85966'
SOURCE_TREE = '3063508c52c1c348f8eeef59c49ce424608557ef'
READER_BLOB = '1f1565473cc1ab8d8e98791f0fc4af440f9d3d32'
READER_SHA256 = '154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11'
CONFIG_BLOB = '92911acc9fe079f63c12c6fd762904a40be6ad18'
DOCKERFILE_BLOB = '88dabbb4a409e0043d120a3abc6b38dfe169120c'
NPMRC_BLOB = '4a6e0c1f5dd5113f91d90150860666989fd282b0'
SOURCE_MANIFEST_SHA256 = '57431e14db8a68376629dfe61393e24785ec56e3d2f8dc98ccf052b82ba9ee2d'
SOURCE_BUCKET = PROJECT + '-cloudbuild-source'
REPOSITORY = 'khedmah-preview'
BUILD_SA = 'khedmah-pv2-build@' + PROJECT + '.iam.gserviceaccount.com'
SA_NAME = 'projects/' + PROJECT + '/serviceAccounts/' + BUILD_SA
AR_NAME = f'projects/{PROJECT}/locations/{REGION}/repositories/{REPOSITORY}'
IMAGE = f'{REGION}-docker.pkg.dev/{PROJECT}/{REPOSITORY}/backend'
BUILD_PARENT = f'projects/{PROJECT}/locations/{REGION}'
BUILDS_URL = 'https://cloudbuild.googleapis.com/v1/' + BUILD_PARENT + '/builds'
BUCKET_URL = 'https://storage.googleapis.com/storage/v1/b/' + SOURCE_BUCKET
SA_URL = 'https://iam.googleapis.com/v1/' + SA_NAME
AR_URL = 'https://artifactregistry.googleapis.com/v1/' + AR_NAME
PROJECT_TEST_URL = 'https://cloudresourcemanager.googleapis.com/v3/projects/' + NUMBER + ':testIamPermissions'
FIXED_FILES = {'.dockerignore', '.npmrc', 'Dockerfile.backend', 'cloudbuild.preview-backend.yaml',
               'package.json', 'package-lock.json', 'apps/frontend/package.json'}
MAX_JSON = 4 * 1024 * 1024
MAX_ARCHIVE = 32 * 1024 * 1024
MAX_SOURCE = 4 * 1024 * 1024
EXPECTED_FILES = 318
BUILD_STATUSES = {'STATUS_UNKNOWN', 'PENDING', 'QUEUED', 'WORKING', 'SUCCESS', 'FAILURE',
                  'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'}
PROJECT_PERMISSIONS = ['cloudbuild.builds.create', 'cloudbuild.builds.get',
                       'cloudbuild.builds.list', 'serviceusage.services.use']
BUCKET_PERMISSIONS = ['storage.buckets.get', 'storage.objects.create', 'storage.objects.get']
BUCKET_TEST_URL = BUCKET_URL + '/iam/testPermissions?' + urllib.parse.urlencode(
    [('permissions', permission) for permission in BUCKET_PERMISSIONS])


def stop(code):
    raise SystemExit('STOP: ' + code)


def require(condition, code):
    if not condition:
        stop(code)


def git_hash(kind, data):
    return hashlib.sha1(kind.encode() + b' ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def json_sha256(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def gh_read(path, limit=MAX_JSON):
    allowed = {'repos/' + REPO + '/git/blobs/' + READER_BLOB,
               'repos/' + REPO + '/git/commits/' + SOURCE_COMMIT,
               'repos/' + REPO + '/git/trees/' + SOURCE_TREE + '?recursive=1',
               'repos/' + REPO + '/tarball/' + SOURCE_COMMIT}
    require(path in allowed, 'GITHUB_READ_SCOPE_REJECTED')
    env = {key: value for key, value in os.environ.items() if key not in ('GH_DEBUG', 'DEBUG')}
    try:
        result = subprocess.run(['gh', 'api', '--hostname', 'github.com', '--method', 'GET', path],
                                capture_output=True, timeout=120, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop('PINNED_SOURCE_READ_UNAVAILABLE')
    require(result.returncode == 0 and len(result.stdout) <= limit, 'PINNED_SOURCE_READ_UNAVAILABLE')
    return result.stdout


def json_object(raw):
    try:
        value = json.loads(raw)
    except (ValueError, TypeError, UnicodeError):
        stop('METADATA_JSON_INVALID')
    require(isinstance(value, dict), 'METADATA_JSON_INVALID')
    return value


def load_reader(work):
    value = json_object(gh_read('repos/' + REPO + '/git/blobs/' + READER_BLOB))
    require(value.get('sha') == READER_BLOB and value.get('encoding') == 'base64', 'READER_METADATA_MISMATCH')
    try:
        data = base64.b64decode(''.join(value['content'].split()), validate=True)
    except (KeyError, ValueError, TypeError, AttributeError):
        stop('READER_ENCODING_INVALID')
    require(len(data) <= 262144 and value.get('size') == len(data)
            and git_hash('blob', data) == READER_BLOB
            and hashlib.sha256(data).hexdigest() == READER_SHA256, 'READER_BYTES_MISMATCH')
    path = work / 'pinned_reader.py'
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)
    spec = importlib.util.spec_from_file_location('candidate_owner_preflight', path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    require((reader.PROJECT, reader.NUMBER, reader.ACCOUNT, reader.REGION)
            == (PROJECT, NUMBER, ACCOUNT, REGION), 'READER_IDENTITY_MISMATCH')
    return reader


def safe_path(path):
    return (isinstance(path, str) and 0 < len(path) <= 512 and '\\' not in path
            and '\0' not in path and not path.startswith('/')
            and all(part not in ('', '.', '..') for part in path.split('/')))


def validate_tree(value):
    require(value.get('sha') == SOURCE_TREE and value.get('truncated') is False
            and isinstance(value.get('tree'), list) and len(value['tree']) <= 10000, 'SOURCE_TREE_INVALID')
    entries, children = {}, {}
    for row in value['tree']:
        require(isinstance(row, dict) and safe_path(row.get('path')) and row['path'] not in entries
                and isinstance(row.get('sha'), str) and re.fullmatch('[0-9a-f]{40}', row['sha'])
                and (row.get('mode'), row.get('type')) in {('040000', 'tree'), ('100644', 'blob'),
                    ('100755', 'blob'), ('120000', 'blob'), ('160000', 'commit')}, 'SOURCE_TREE_ENTRY_INVALID')
        path = row['path']
        entries[path] = row
        parent, _, name = path.rpartition('/')
        children.setdefault(parent, []).append((name, row))
    for directory, rows in children.items():
        expected = SOURCE_TREE if directory == '' else entries.get(directory, {}).get('sha')
        require(directory == '' or entries.get(directory, {}).get('type') == 'tree', 'SOURCE_TREE_PARENT_MISSING')
        rows.sort(key=lambda pair: (pair[0] + ('/' if pair[1]['type'] == 'tree' else '')).encode())
        data = b''.join((row['mode'].lstrip('0') + ' ' + name).encode() + b'\0' + bytes.fromhex(row['sha'])
                        for name, row in rows)
        require(git_hash('tree', data) == expected, 'SOURCE_TREE_HASH_MISMATCH')
    manifest = {path: row for path, row in entries.items()
                if path in FIXED_FILES or (path.startswith('apps/backend/') and row['type'] != 'tree')}
    require(len(manifest) == EXPECTED_FILES and FIXED_FILES <= manifest.keys()
            and all(row['mode'] == '100644' and row['type'] == 'blob'
                    and type(row.get('size')) is int and 0 <= row['size'] <= MAX_SOURCE for row in manifest.values())
            and sum(row['size'] for row in manifest.values()) <= MAX_SOURCE, 'SOURCE_MANIFEST_INVALID')
    require(manifest['cloudbuild.preview-backend.yaml']['sha'] == CONFIG_BLOB, 'BUILD_CONFIG_CHANGED')
    require(manifest['Dockerfile.backend']['sha'] == DOCKERFILE_BLOB
            and manifest['.npmrc']['sha'] == NPMRC_BLOB, 'BACKEND_INSTALL_POLICY_SOURCE_CHANGED')
    require(json_sha256([(path, row['mode'], row['sha'], row['size']) for path, row in sorted(manifest.items())])
            == SOURCE_MANIFEST_SHA256, 'SOURCE_MANIFEST_HASH_MISMATCH')
    return manifest


def package_source(archive, manifest):
    require(isinstance(archive, bytes) and len(archive) <= MAX_ARCHIVE, 'SOURCE_ARCHIVE_TOO_LARGE')
    files, seen, prefix, total = {}, set(), None, 0
    try:
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source:
            for count, member in enumerate(source, 1):
                name = member.name.rstrip('/') if member.isdir() else member.name
                require(count <= 10000 and safe_path(name) and name not in seen, 'SOURCE_ARCHIVE_MEMBER_INVALID')
                seen.add(name)
                parts = name.split('/', 1)
                prefix = parts[0] if prefix is None else prefix
                require(parts[0] == prefix, 'SOURCE_ARCHIVE_ROOT_MISMATCH')
                total += member.size
                require(total <= 64 * 1024 * 1024 and member.size >= 0, 'SOURCE_ARCHIVE_EXPANSION_REJECTED')
                if len(parts) == 1 or parts[1] not in manifest:
                    continue
                path, expected = parts[1], manifest[parts[1]]
                require(member.isfile() and not member.issparse() and member.size == expected['size']
                        and path not in files, 'SOURCE_ARCHIVE_FILE_INVALID')
                stream = source.extractfile(member)
                require(stream is not None, 'SOURCE_ARCHIVE_FILE_INVALID')
                data = stream.read(MAX_SOURCE + 1)
                require(len(data) == expected['size'] and git_hash('blob', data) == expected['sha'], 'SOURCE_BLOB_MISMATCH')
                files[path] = data
    except (tarfile.TarError, OSError, EOFError):
        stop('SOURCE_ARCHIVE_INVALID')
    require(files.keys() == manifest.keys(), 'SOURCE_ARCHIVE_FILES_MISSING')
    require(files['.npmrc'] == b'strict-allow-scripts=true\n'
            and files['Dockerfile.backend'].count(b'COPY package.json package-lock.json .npmrc ./') == 2,
            'BACKEND_INSTALL_POLICY_NOT_PRESERVED')
    raw = io.BytesIO()
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as target:
            for path, data in sorted(files.items()):
                member = tarfile.TarInfo(path)
                member.size, member.mode, member.mtime = len(data), 0o644, 0
                target.addfile(member, io.BytesIO(data))
    result = raw.getvalue()
    require(len(result) <= MAX_SOURCE, 'PACKAGED_SOURCE_TOO_LARGE')
    return result


def source_package():
    commit = json_object(gh_read('repos/' + REPO + '/git/commits/' + SOURCE_COMMIT))
    require(commit.get('sha') == SOURCE_COMMIT and commit.get('tree', {}).get('sha') == SOURCE_TREE, 'SOURCE_COMMIT_TREE_MISMATCH')
    manifest = validate_tree(json_object(gh_read('repos/' + REPO + '/git/trees/' + SOURCE_TREE + '?recursive=1')))
    return package_source(gh_read('repos/' + REPO + '/tarball/' + SOURCE_COMMIT, MAX_ARCHIVE), manifest)


def valid_id(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', value) is not None


def intent_path(root):
    return root / (SOURCE_COMMIT + '.json')


def private_root(root, create=False):
    if create:
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
            'INTENT_DIRECTORY_NOT_PRIVATE')


def validate_intent(value):
    require(isinstance(value, dict) and value.get('source_commit') == SOURCE_COMMIT
            and value.get('source_tree') == SOURCE_TREE and value.get('project') == PROJECT
            and value.get('canonical_config_blob') == CONFIG_BLOB
            and value.get('source_manifest_sha256') == SOURCE_MANIFEST_SHA256
            and valid_id(value.get('attempt')) and isinstance(value.get('archive_sha256'), str)
            and re.fullmatch('[0-9a-f]{64}', value['archive_sha256'])
            and type(value.get('archive_size')) is int and 0 < value['archive_size'] <= MAX_SOURCE
            and isinstance(value.get('archive_md5'), str) and len(value['archive_md5']) == 24,
            'INTENT_INVALID')
    attempt = value['attempt']
    require(value.get('object') == f'approval-candidate/{SOURCE_COMMIT}/{attempt}.tar.gz'
            and value.get('image_tag') == 'approval-' + SOURCE_COMMIT[:12] + '-' + attempt
            and value.get('build_tag') == 'approval-intent-' + attempt
            and value.get('phase') in ('intent_recorded', 'source_upload_requested', 'source_uploaded',
                                      'build_submission_requested', 'build_acknowledged'), 'INTENT_SCOPE_MISMATCH')
    if 'generation' in value:
        require(isinstance(value['generation'], str) and re.fullmatch('[1-9][0-9]{0,30}', value['generation']), 'INTENT_GENERATION_INVALID')
    if 'build_id' in value:
        require(valid_id(value['build_id']), 'INTENT_BUILD_ID_INVALID')
    if 'submitted_config_sha256' in value:
        require(isinstance(value['submitted_config_sha256'], str)
                and re.fullmatch('[0-9a-f]{64}', value['submitted_config_sha256']), 'INTENT_CONFIG_HASH_INVALID')
    return value


def save_intent(root, value, exclusive=False):
    private_root(root, create=exclusive)
    validate_intent(value)
    data = (json.dumps(value, sort_keys=True) + '\n').encode()
    path = intent_path(root)
    if exclusive:
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            stop('EXISTING_INTENT_STATUS_ONLY_NO_RESUBMIT')
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    else:
        # Atomic receipt updates; --status never changes this local intent.
        load_intent(root)
        fd, temporary = tempfile.mkstemp(prefix='.receipt-', dir=root)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def load_intent(root):
    private_root(root)
    fd = os.open(intent_path(root), os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.getuid()
                and info.st_mode & 0o077 == 0 and info.st_size <= 16384, 'INTENT_FILE_NOT_PRIVATE')
        return validate_intent(json_object(stream.read(16385)))


def create_intent(root, archive):
    attempt = str(uuid.uuid4())
    value = dict(project=PROJECT, source_commit=SOURCE_COMMIT, source_tree=SOURCE_TREE,
                 canonical_config_blob=CONFIG_BLOB, source_manifest_sha256=SOURCE_MANIFEST_SHA256,
                 attempt=attempt, created_utc=utc_now(), phase='intent_recorded',
                 archive_sha256=hashlib.sha256(archive).hexdigest(), archive_size=len(archive),
                 archive_md5=base64.b64encode(hashlib.md5(archive).digest()).decode(),
                 object=f'approval-candidate/{SOURCE_COMMIT}/{attempt}.tar.gz',
                 image_tag='approval-' + SOURCE_COMMIT[:12] + '-' + attempt,
                 build_tag='approval-intent-' + attempt)
    save_intent(root, value, exclusive=True)
    return value


def object_url(intent, generation=None):
    url = BUCKET_URL + '/o/' + urllib.parse.quote(intent['object'], safe='')
    return url + ('?generation=' + generation if generation else '')


def upload_url(intent):
    return 'https://storage.googleapis.com/upload/storage/v1/b/' + SOURCE_BUCKET + '/o?' + urllib.parse.urlencode(
        {'uploadType': 'media', 'name': intent['object'], 'ifGenerationMatch': '0'})


def list_url(intent):
    return BUILDS_URL + '?' + urllib.parse.urlencode({'projectId': PROJECT, 'pageSize': '2',
                                                     'filter': 'tags="' + intent['build_tag'] + '"'})


def allowed_request(method, url, intent=None):
    static = {('GET', BUCKET_URL), ('GET', SA_URL), ('GET', AR_URL), ('GET', BUCKET_TEST_URL),
              ('POST', PROJECT_TEST_URL), ('POST', SA_URL + ':testIamPermissions'),
              ('POST', AR_URL + ':testIamPermissions')}
    if (method, url) in static:
        return True
    if intent is None:
        return False
    validate_intent(intent)
    reads = {object_url(intent), list_url(intent)}
    if 'generation' in intent:
        reads.add(object_url(intent, intent['generation']))
    if 'build_id' in intent:
        reads.add(BUILDS_URL + '/' + intent['build_id'])
    return ((method == 'GET' and url in reads)
            or (method == 'POST' and url in {upload_url(intent), BUILDS_URL + '?projectId=' + PROJECT}))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class GoogleApi:
    def __init__(self, token, intent=None, readonly=False):
        require(isinstance(token, str) and re.fullmatch('[A-Za-z0-9._~+/-]{20,8192}={0,2}', token), 'ACCESS_TOKEN_INVALID')
        self.token, self.intent, self.readonly = token, intent, readonly

    def __call__(self, method, url, body=None, content_type='application/json', allow_missing=False):
        require(allowed_request(method, url, self.intent), 'HTTP_SCOPE_REJECTED')
        mutating = method == 'POST' and not url.endswith(':testIamPermissions')
        require(not self.readonly or not mutating, 'READ_ONLY_MODE_REJECTED_MUTATION')
        if mutating and url == upload_url(self.intent):
            require(self.intent['phase'] == 'source_upload_requested' and isinstance(body, bytes)
                    and content_type == 'application/gzip' and len(body) == self.intent['archive_size']
                    and hashlib.sha256(body).hexdigest() == self.intent['archive_sha256'], 'HTTP_UPLOAD_BODY_REJECTED')
        elif mutating:
            require(self.intent['phase'] == 'build_submission_requested'
                    and body == build_request(self.intent) and content_type == 'application/json', 'HTTP_BUILD_BODY_REJECTED')
        require(not allow_missing or (method == 'GET' and self.intent is not None
                                      and url in {object_url(self.intent), object_url(self.intent, self.intent.get('generation'))}),
                'HTTP_MISSING_SCOPE_REJECTED')
        data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': 'Bearer ' + self.token, 'x-goog-user-project': PROJECT, 'Content-Type': content_type})
        try:
            # No redirect, retry adapter, proxy environment, or automatic resource creation.
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=60) as response:
                raw = response.read(MAX_JSON + 1)
        except urllib.error.HTTPError as error:
            if error.code == 404 and allow_missing:
                return None
            stop(('MUTATION_HTTP_' if mutating else 'METADATA_HTTP_') + str(error.code) + '_STATUS_ONLY_NO_RESUBMIT')
        except (OSError, ValueError):
            stop('MUTATION_UNCONFIRMED_STATUS_ONLY_NO_RESUBMIT' if mutating else 'METADATA_READ_UNAVAILABLE')
        require(len(raw) <= MAX_JSON, 'HTTP_METADATA_TOO_LARGE')
        return json_object(raw)


def check_permissions(value, expected):
    actual = value.get('permissions', [])
    require(isinstance(actual, list) and all(isinstance(item, str) for item in actual)
            and len(actual) == len(set(actual)) and set(actual) == set(expected), 'SELECTED_OWNER_PERMISSIONS_INCOMPLETE')


def validate_service_account(value):
    require(isinstance(value, dict) and value.get('projectId') == PROJECT and value.get('email') == BUILD_SA
            and value.get('disabled', False) is False and isinstance(value.get('uniqueId'), str)
            and re.fullmatch('[0-9]{10,30}', value['uniqueId']), 'BUILD_ACCOUNT_IDENTITY_MISMATCH')
    require(value.get('name') in {SA_NAME, 'projects/' + PROJECT + '/serviceAccounts/' + value['uniqueId']},
            'BUILD_ACCOUNT_IDENTITY_MISMATCH')
    return value['uniqueId']


def validate_repository(value):
    require(isinstance(value, dict) and value.get('name') == AR_NAME and value.get('format') == 'DOCKER'
            and type(value.get('disallowUnspecifiedMode', False)) is bool
            and not {'remoteRepositoryConfig', 'virtualRepositoryConfig', 'mavenConfig'} & value.keys(),
            'ARTIFACT_REPOSITORY_IDENTITY_MISMATCH')
    mode = value.get('mode', 'MODE_UNSPECIFIED')
    require(mode == 'STANDARD_REPOSITORY' or (mode == 'MODE_UNSPECIFIED'
            and value.get('disallowUnspecifiedMode', False) is False), 'ARTIFACT_REPOSITORY_IDENTITY_MISMATCH')


def preflight_resources(api):
    bucket, repository, account = api('GET', BUCKET_URL), api('GET', AR_URL), api('GET', SA_URL)
    iam = bucket.get('iamConfiguration', {})
    require(bucket.get('name') == SOURCE_BUCKET and str(bucket.get('projectNumber')) == NUMBER
            and bucket.get('location') == REGION.upper() and iam.get('uniformBucketLevelAccess', {}).get('enabled') is True
            and iam.get('publicAccessPrevention') == 'enforced', 'SOURCE_BUCKET_IDENTITY_MISMATCH')
    validate_repository(repository)
    validate_service_account(account)
    check_permissions(api('POST', PROJECT_TEST_URL, {'permissions': PROJECT_PERMISSIONS}), PROJECT_PERMISSIONS)
    check_permissions(api('GET', BUCKET_TEST_URL), BUCKET_PERMISSIONS)
    check_permissions(api('POST', SA_URL + ':testIamPermissions', {'permissions': ['iam.serviceAccounts.actAs']}), ['iam.serviceAccounts.actAs'])
    check_permissions(api('POST', AR_URL + ':testIamPermissions', {'permissions': ['artifactregistry.repositories.get']}), ['artifactregistry.repositories.get'])


def validate_object(value, intent):
    require(isinstance(value, dict) and value.get('bucket') == SOURCE_BUCKET and value.get('name') == intent['object']
            and value.get('size') == str(intent['archive_size']) and value.get('md5Hash') == intent['archive_md5']
            and isinstance(value.get('generation'), str) and re.fullmatch('[1-9][0-9]{0,30}', value['generation'])
            and ('generation' not in intent or value['generation'] == intent['generation']), 'SOURCE_OBJECT_MISMATCH')
    return value['generation']


def build_request(intent):
    validate_intent(intent)
    require('generation' in intent, 'SOURCE_GENERATION_REQUIRED')
    image = IMAGE + ':' + intent['image_tag']
    # Literal expansion of the pinned canonical YAML; identity/time/tags are
    # bounded operator additions. No environment, secrets, deploy or migration.
    value = dict(source={'storageSource': {'bucket': SOURCE_BUCKET, 'object': intent['object'], 'generation': intent['generation']}},
                steps=[{'id': 'build-backend', 'name': 'gcr.io/cloud-builders/docker',
                        'args': ['build', '--file=Dockerfile.backend', '--tag=' + image, '.']}],
                images=[image], serviceAccount=SA_NAME, timeout='1200s', queueTtl='600s',
                options={'logging': 'CLOUD_LOGGING_ONLY', 'substitutionOption': 'MUST_MATCH'},
                tags=['approval-candidate', 'source-' + SOURCE_COMMIT, intent['build_tag']])
    require('submitted_config_sha256' not in intent or json_sha256(value) == intent['submitted_config_sha256'],
            'SUBMITTED_CONFIG_HASH_MISMATCH')
    return value


def same_storage_source(value, expected):
    # The API documents omitted/unspecified fetcher as GSUTIL; no other source
    # fields or fetcher implementation are equivalent to this pinned request.
    return (isinstance(value, dict) and set(value) <= {'bucket', 'object', 'generation', 'sourceFetcher'}
            and all(value.get(key) == expected[key] for key in ('bucket', 'object', 'generation'))
            and value.get('sourceFetcher', 'SOURCE_FETCHER_UNSPECIFIED') in ('SOURCE_FETCHER_UNSPECIFIED', 'GSUTIL'))


def validate_build(value, intent):
    expected = build_request(intent)
    require(isinstance(value, dict) and valid_id(value.get('id')) and value.get('projectId') == PROJECT
            and value.get('name') in {f'projects/{project}/locations/{REGION}/builds/' + value['id'] for project in (PROJECT, NUMBER)}
            and ('build_id' not in intent or value['id'] == intent['build_id'])
            and value.get('status') in BUILD_STATUSES, 'BUILD_IDENTITY_MISMATCH')
    source = value.get('source')
    require(isinstance(source, dict) and set(source) == {'storageSource'}
            and same_storage_source(source['storageSource'], expected['source']['storageSource']), 'BUILD_REQUEST_MISMATCH')
    for key in ('images', 'serviceAccount', 'timeout', 'queueTtl'):
        require(value.get(key) == expected[key], 'BUILD_REQUEST_MISMATCH')
    require(isinstance(value.get('tags'), list) and sorted(value['tags']) == sorted(expected['tags']), 'BUILD_TAGS_MISMATCH')
    steps, options = value.get('steps'), value.get('options', {})
    require(isinstance(steps, list) and len(steps) == 1 and isinstance(steps[0], dict)
            and all(steps[0].get(key) == item for key, item in expected['steps'][0].items())
            and not (set(steps[0]) - set(expected['steps'][0]) - {'timing', 'pullTiming', 'status', 'exitCode'}), 'BUILD_STEPS_MISMATCH')
    allowed_option_keys = {'logging', 'substitutionOption', 'resolvedWorkerRelease', 'pool', 'workerRelease'}
    resolved_worker_release = options.get('resolvedWorkerRelease')
    require(isinstance(options, dict) and options.get('logging') == 'CLOUD_LOGGING_ONLY'
            and options.get('substitutionOption', 'MUST_MATCH') == 'MUST_MATCH'
            and not (set(options) - allowed_option_keys)
            and ('pool' not in options or options.get('pool') == {})
            and ('workerRelease' not in options or options.get('workerRelease') == 'legacy')
            and ('resolvedWorkerRelease' not in options
                 or (isinstance(resolved_worker_release, str)
                     and (resolved_worker_release == 'legacy'
                          or re.fullmatch(r'20[0-9]{2}\.[0-9]{2}', resolved_worker_release) is not None))),
            'BUILD_OPTIONS_MISMATCH')
    require(not any(value.get(key) for key in ('secrets', 'availableSecrets', 'logsBucket', 'buildTriggerId',
                                              'substitutions', 'dependencies', 'gitConfig')),
            'BUILD_UNEXPECTED_INPUTS')
    artifacts = value.get('artifacts', {})
    require(isinstance(artifacts, dict) and not (set(artifacts) - {'images'})
            and artifacts.get('images', expected['images']) == expected['images'], 'BUILD_UNEXPECTED_ARTIFACTS')
    receipt = {'build_id': value['id'], 'build_status': value['status'], 'build_path_verified': False}
    if value['status'] == 'SUCCESS':
        require(steps[0].get('status') == 'SUCCESS' and type(steps[0].get('exitCode', 0)) is int
                and steps[0].get('exitCode', 0) == 0, 'BUILD_STEP_NOT_SUCCESSFUL')
        images = value.get('results', {}).get('images', [])
        require(isinstance(images, list) and len(images) == 1 and isinstance(images[0], dict)
                and images[0].get('name') == expected['images'][0] and isinstance(images[0].get('digest'), str)
                and re.fullmatch('sha256:[0-9a-f]{64}', images[0]['digest']), 'BUILD_IMAGE_RESULT_MISMATCH')
        provenance = value.get('sourceProvenance')
        require(isinstance(provenance, dict) and set(provenance) <= {'resolvedStorageSource', 'fileHashes'}
                and same_storage_source(provenance.get('resolvedStorageSource'), expected['source']['storageSource']),
                'BUILD_SOURCE_PROVENANCE_MISMATCH')
        digests = value.get('results', {}).get('buildStepImages', [])
        require(isinstance(digests, list) and len(digests) == 1 and isinstance(digests[0], str)
                and re.fullmatch('sha256:[0-9a-f]{64}', digests[0]), 'BUILD_STEP_DIGEST_MISSING')
        receipt.update(build_path_verified=True, image_digest=images[0]['digest'],
                       image_reference=IMAGE + '@' + images[0]['digest'], builder_image_digest=digests[0])
    return receipt


def diagnose_build_options(value, intent):
    """Read-only, value-redacted diagnosis for a build that failed only options validation."""
    try:
        strict = validate_build(value, intent)
    except SystemExit as error:
        require(str(error) == 'STOP: BUILD_OPTIONS_MISMATCH', 'BUILD_DIAGNOSTIC_SCOPE_MISMATCH')
        strict = None
    options = value.get('options')
    require(isinstance(options, dict) and len(options) <= 64
            and all(isinstance(key, str) and re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,127}', key)
                    for key in options), 'BUILD_DIAGNOSTIC_OPTIONS_INVALID')
    require(not any(value.get(key) for key in ('secrets', 'availableSecrets', 'logsBucket', 'buildTriggerId',
                                              'substitutions', 'dependencies', 'gitConfig')),
            'BUILD_DIAGNOSTIC_UNEXPECTED_INPUTS')
    artifacts = value.get('artifacts', {})
    expected = build_request(intent)
    require(isinstance(artifacts, dict) and not (set(artifacts) - {'images'})
            and artifacts.get('images', expected['images']) == expected['images'],
            'BUILD_DIAGNOSTIC_UNEXPECTED_ARTIFACTS')
    accepted_keys = {'logging', 'substitutionOption', 'resolvedWorkerRelease', 'pool', 'workerRelease'}
    pool_present = 'pool' in options
    pool = options.get('pool')
    if pool_present:
        require(isinstance(pool, dict) and len(pool) <= 16
                and all(isinstance(key, str) and re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,127}', key)
                        for key in pool), 'BUILD_DIAGNOSTIC_POOL_INVALID')
    else:
        pool = {}
    worker_release = options.get('workerRelease')
    if 'workerRelease' in options:
        require(isinstance(worker_release, str) and len(worker_release) <= 64,
                'BUILD_DIAGNOSTIC_WORKER_RELEASE_INVALID')
    pool_worker_release = pool.get('workerRelease')
    pool_resolved_release = pool.get('resolvedWorkerRelease')
    for release in (pool_worker_release, pool_resolved_release):
        if release is not None:
            require(isinstance(release, str) and len(release) <= 64,
                    'BUILD_DIAGNOSTIC_POOL_RELEASE_INVALID')
    pool_keys = set(pool)
    documented_pool_keys = {'name', 'workerRelease', 'resolvedWorkerRelease'}
    result = {
        'build_id': value['id'],
        'build_status': value['status'],
        'build_path_verified': strict.get('build_path_verified', False) if strict is not None else False,
        'strict_validation_succeeded': strict is not None,
        'diagnostic_scope': 'options_only',
        'options_key_count': len(options),
        'option_keys': sorted(options),
        'unexpected_option_keys': sorted(set(options) - accepted_keys),
        'missing_required_option_keys': sorted(key for key in expected['options'] if key not in options),
        'logging_matches': options.get('logging') == expected['options']['logging'],
        'substitution_option_matches': options.get('substitutionOption', 'MUST_MATCH')
            == expected['options']['substitutionOption'],
        'resolved_worker_release_present': 'resolvedWorkerRelease' in options,
        'pool_present': pool_present,
        'pool_key_count': len(pool),
        'pool_keys': sorted(pool),
        'pool_unexpected_keys': sorted(pool_keys - documented_pool_keys),
        'pool_name_present': 'name' in pool,
        'pool_name_nonempty': isinstance(pool.get('name'), str) and bool(pool.get('name')),
        'pool_name_matches_worker_pool_resource': isinstance(pool.get('name'), str)
            and re.fullmatch(r'projects/[^/]+/locations/[^/]+/workerPools/[^/]+', pool.get('name')) is not None,
        'pool_worker_release_present': pool_worker_release is not None,
        'pool_worker_release_is_legacy': pool_worker_release == 'legacy',
        'pool_resolved_worker_release_present': pool_resolved_release is not None,
        'pool_resolved_worker_release_is_legacy_or_version': isinstance(pool_resolved_release, str)
            and (pool_resolved_release == 'legacy' or re.fullmatch(r'20[0-9]{2}\.[0-9]{2}', pool_resolved_release) is not None),
        'worker_release_present': 'workerRelease' in options,
        'worker_release_is_legacy': worker_release == 'legacy',
        'worker_release_is_known_channel': worker_release in {'legacy', 'regular', 'rapid', 'stable'},
        'worker_release_is_version': isinstance(worker_release, str)
            and re.fullmatch(r'20[0-9]{2}\.[0-9]{2}', worker_release) is not None,
        'pool_worker_release_matches_top_level': pool_worker_release is not None
            and worker_release is not None and pool_worker_release == worker_release,
        'options_values_redacted': True,
        'resubmission_allowed': False,
    }
    return result


def upload_source(api, root, intent, archive):
    require(intent['phase'] == 'intent_recorded' and len(archive) == intent['archive_size']
            and hashlib.sha256(archive).hexdigest() == intent['archive_sha256'], 'UPLOAD_PRECONDITION_MISMATCH')
    intent['phase'] = 'source_upload_requested'
    save_intent(root, intent)
    value = api('POST', upload_url(intent), archive, content_type='application/gzip')
    intent.update(generation=validate_object(value, intent), phase='source_uploaded')
    save_intent(root, intent)


def submit_build(api, root, intent):
    require(intent['phase'] == 'source_uploaded', 'BUILD_SUBMISSION_PRECONDITION_MISMATCH')
    request = build_request(intent)
    intent['submitted_config_sha256'] = json_sha256(request)
    intent['phase'] = 'build_submission_requested'
    save_intent(root, intent)
    # Cloud Build create has no documented requestId. Exactly one HTTP call.
    operation = api('POST', BUILDS_URL + '?projectId=' + PROJECT, request)
    build = operation.get('metadata', {}).get('build', {})
    require(isinstance(build, dict) and valid_id(build.get('id')) and not operation.get('error'),
            'BUILD_SUBMISSION_UNCONFIRMED_STATUS_ONLY_NO_RESUBMIT')
    intent.update(build_id=build['id'], phase='build_acknowledged')
    save_intent(root, intent)
    return validate_build(api('GET', BUILDS_URL + '/' + intent['build_id']), intent)


def wait_for_build(api, intent, result):
    # Only GETs follow the single create. A wait deadline is not a cancellation,
    # failure result, or reason to create another build.
    deadline = time.monotonic() + 1500
    while result['build_status'] in {'STATUS_UNKNOWN', 'PENDING', 'QUEUED', 'WORKING'}:
        if time.monotonic() >= deadline:
            return dict(result, wait_window_elapsed=True)
        time.sleep(10)
        result = validate_build(api('GET', BUILDS_URL + '/' + intent['build_id']), intent)
    return result


def status(api, intent):
    # Read-only reconciliation also covers an accepted request whose reply was
    # lost. Zero matches does not establish non-submission or permit a retry.
    result = {'build_status': 'UNCONFIRMED', 'build_path_verified': False, 'resubmission_allowed': False}
    obj = api('GET', object_url(intent, intent.get('generation')), allow_missing=True)
    result['source_object_observed'] = obj is not None
    if obj is None:
        return result
    generation = validate_object(obj, intent)
    result['source_generation'] = generation
    observed = dict(intent, generation=generation)
    if 'build_id' in intent:
        build = api('GET', BUILDS_URL + '/' + intent['build_id'])
    else:
        listing = api('GET', list_url(intent))
        rows = listing.get('builds', [])
        require(isinstance(rows, list) and len(rows) <= 1 and not listing.get('nextPageToken'), 'BUILD_RECOVERY_AMBIGUOUS')
        if not rows:
            return result
        build = rows[0]
    result.update(source_generation=generation, **validate_build(build, observed))
    return result


def diagnose_status(api, intent):
    # This mode is intentionally narrower than --status: it requires the exact
    # acknowledged build id and never falls back to a tag search or any write.
    require(intent.get('phase') == 'build_acknowledged' and 'build_id' in intent,
            'BUILD_DIAGNOSTIC_BUILD_ID_REQUIRED')
    obj = api('GET', object_url(intent, intent.get('generation')), allow_missing=True)
    require(obj is not None, 'BUILD_DIAGNOSTIC_SOURCE_OBJECT_MISSING')
    generation = validate_object(obj, intent)
    observed = dict(intent, generation=generation)
    build = api('GET', BUILDS_URL + '/' + intent['build_id'])
    result = diagnose_build_options(build, observed)
    result.update(source_object_observed=True, source_generation=generation)
    return result


def receipt(intent, result, readonly):
    require(set(result) <= {'build_id', 'build_status', 'build_path_verified', 'image_digest', 'image_reference',
                            'builder_image_digest', 'wait_window_elapsed', 'source_object_observed',
                            'source_generation', 'resubmission_allowed'}
            and result.get('resubmission_allowed', False) is False, 'RECEIPT_FIELDS_REJECTED')
    value = dict(stage='PREVIEW_V2_APPROVAL_CANDIDATE_BUILD_STATUS_READ' if readonly else 'PREVIEW_V2_APPROVAL_CANDIDATE_BUILD_SUBMITTED',
                evidence_utc=utc_now(), project=PROJECT, region=REGION, source_commit=SOURCE_COMMIT,
                source_tree=SOURCE_TREE, attempt=intent['attempt'], intent_phase=intent['phase'],
                canonical_config_blob=CONFIG_BLOB, submitted_config_sha256=intent.get('submitted_config_sha256'),
                source_manifest_sha256=SOURCE_MANIFEST_SHA256, source_file_count=EXPECTED_FILES,
                archive_sha256=intent['archive_sha256'], archive_size=intent['archive_size'], source_bucket=SOURCE_BUCKET,
                source_object=intent['object'], source_generation=intent.get('generation'), build_service_account=BUILD_SA,
                current_invocation_read_only=readonly, source_artifact_upload_performed=not readonly,
                build_submission_performed=not readonly, cloud_resource_mutation=not readonly,
                application_deployment_performed=False, application_data_mutation=False, application_data_rows_read=False,
                schema_mutation=False, role_mutation=False, secret_payload_access=False, credential_values_printed=False,
                cloud_run_mutation=False, schema_readiness_verified=False, release_gates_verified=False,
                effective_release_authority_verified=False, production_readiness_verified=False,
                base_image_pinned=False, resubmission_allowed=False)
    value.update(result)
    return value


def diagnostic_receipt(intent, result):
    allowed = {'build_id', 'build_status', 'build_path_verified', 'strict_validation_succeeded',
               'diagnostic_scope', 'options_key_count', 'option_keys', 'unexpected_option_keys',
               'missing_required_option_keys', 'logging_matches', 'substitution_option_matches',
               'resolved_worker_release_present', 'pool_present', 'pool_key_count', 'pool_keys',
               'pool_unexpected_keys', 'pool_name_present', 'pool_name_nonempty',
               'pool_name_matches_worker_pool_resource', 'pool_worker_release_present',
               'pool_worker_release_is_legacy', 'pool_resolved_worker_release_present',
               'pool_resolved_worker_release_is_legacy_or_version', 'worker_release_present',
               'worker_release_is_legacy', 'worker_release_is_known_channel', 'worker_release_is_version',
               'pool_worker_release_matches_top_level', 'options_values_redacted',
               'source_object_observed', 'source_generation', 'resubmission_allowed'}
    require(set(result) <= allowed and result.get('diagnostic_scope') == 'options_only'
            and result.get('options_values_redacted') is True
            and result.get('resubmission_allowed') is False, 'DIAGNOSTIC_RECEIPT_FIELDS_REJECTED')
    value = dict(stage='PREVIEW_V2_APPROVAL_CANDIDATE_BUILD_OPTIONS_DIAGNOSTIC', evidence_utc=utc_now(),
                 project=PROJECT, region=REGION, source_commit=SOURCE_COMMIT, source_tree=SOURCE_TREE,
                 attempt=intent['attempt'], intent_phase=intent['phase'], build_id=intent.get('build_id'),
                 canonical_config_blob=CONFIG_BLOB, submitted_config_sha256=intent.get('submitted_config_sha256'),
                 source_manifest_sha256=SOURCE_MANIFEST_SHA256, current_invocation_read_only=True,
                 diagnostic_values_redacted=True, source_artifact_upload_performed=False,
                 build_submission_performed=False, cloud_resource_mutation=False,
                 application_deployment_performed=False, application_data_mutation=False,
                 application_data_rows_read=False, schema_mutation=False, role_mutation=False,
                 secret_payload_access=False, credential_values_printed=False, cloud_run_mutation=False,
                 schema_readiness_verified=False, release_gates_verified=False,
                 effective_release_authority_verified=False, production_readiness_verified=False,
                 resubmission_allowed=False)
    value.update(result)
    return value


def main():
    require(sys.argv[1:] in (['--build'], ['--status'], ['--diagnose']), 'USAGE_BUILD_OR_STATUS_ONLY')
    os.umask(0o077)
    mode = sys.argv[1]
    readonly = mode != '--build'
    root = Path.home() / '.local' / 'state' / 'khedmah-preview-v2-approval-build'
    if readonly:
        intent = load_intent(root)
    else:
        require(not intent_path(root).exists() and not intent_path(root).is_symlink(), 'EXISTING_INTENT_STATUS_ONLY_NO_RESUBMIT')
    with tempfile.TemporaryDirectory(prefix='khedmah-candidate-preflight-') as directory:
        reader = load_reader(Path(directory))
        reader.preflight()
        token = reader.cloud('auth', 'print-access-token').decode('ascii').strip()
        api = GoogleApi(token, intent if readonly else None, readonly=readonly)
        if mode == '--status':
            result = status(api, intent)
            output = receipt(intent, result, True)
        elif mode == '--diagnose':
            result = diagnose_status(api, intent)
            output = diagnostic_receipt(intent, result)
        else:
            preflight_resources(api)
            archive = source_package()
            intent = create_intent(root, archive)
            api.intent = intent
            upload_source(api, root, intent, archive)
            result = submit_build(api, root, intent)
            result = wait_for_build(api, intent, result)
            output = receipt(intent, result, False)
        print(json.dumps(output, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        stop('INTERRUPTED_STATUS_ONLY_NO_RESUBMIT')
    except (OSError, ValueError, TypeError, KeyError, AttributeError, UnicodeError):
        # Never expose raw HTTP/subprocess exceptions or an access token.
        stop('LOCAL_OR_METADATA_FAILURE_STATUS_ONLY_NO_RESUBMIT')
