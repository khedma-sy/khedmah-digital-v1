#!/usr/bin/env python3
"""Initialize only the new Preview's SQL identities and two credential versions.

One-shot operator batch. Existing users/versions or a failed-run journal require
reconciliation, not a retry. No schema migrations, deployment or federation.
"""
import argparse
import base64
import fcntl
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ORGANIZATION = '594049370623'
ACCOUNT = 'haifawi30@gmail.com'
REGION = 'europe-west1'
INSTANCE = 'khedmah-preview-v2-db'
CONNECTION = f'{PROJECT}:{REGION}:{INSTANCE}'
DATABASE = 'khedmah'
PORT = '19479'
USERS = {'khedmah_app': 'khedmah_runtime_role', 'khedmah_migrator': 'khedmah_migration_role'}
SECRET_USERS = {'DATABASE_URL': 'khedmah_app', 'DATABASE_MIGRATION_URL': 'khedmah_migrator'}
SQL_BASE = f'https://sqladmin.googleapis.com/sql/v1beta4/projects/{PROJECT}'
SM_BASE = f'https://secretmanager.googleapis.com/v1/projects/{NUMBER}/secrets/'
PERMISSIONS = {'secretmanager.versions.add', 'secretmanager.versions.access',
               'secretmanager.versions.get', 'secretmanager.versions.list'}

EMPTY_SQL = """
SELECT json_build_object('database', current_database(), 'user', current_user,
 'relations', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),
 'routines', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),
 'schemas', (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_'
   AND nspname NOT IN ('public','information_schema')),
 'roles', (SELECT count(*) FROM pg_roles WHERE rolname IN
   ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')));
"""
PREPARE_SQL = """
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
CREATE ROLE khedmah_runtime_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE khedmah_migration_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE khedmah FROM PUBLIC;
GRANT CONNECT ON DATABASE khedmah TO khedmah_runtime_role;
GRANT CONNECT, CREATE ON DATABASE khedmah TO khedmah_migration_role;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO khedmah_runtime_role;
GRANT USAGE, CREATE ON SCHEMA public TO khedmah_migration_role;
COMMIT;
"""
ROLE_CHECK_SQL = """
SELECT json_build_object('database', current_database(),
 'roles', (SELECT json_agg(json_build_object('name', rolname, 'login', rolcanlogin,
   'super', rolsuper, 'createdb', rolcreatedb, 'createrole', rolcreaterole,
   'replication', rolreplication, 'bypassrls', rolbypassrls)) FROM pg_roles WHERE rolname IN
   ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')),
 'memberships', (SELECT coalesce(json_agg(json_build_object('member', u.rolname,
   'role', r.rolname, 'admin', m.admin_option, 'inherit', m.inherit_option, 'set', m.set_option)), '[]'::json)
   FROM pg_auth_members m JOIN pg_roles u ON u.oid=m.member JOIN pg_roles r ON r.oid=m.roleid
   WHERE u.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')),
 'runtime_connect', has_database_privilege('khedmah_app','khedmah','CONNECT'),
 'runtime_create', has_database_privilege('khedmah_app','khedmah','CREATE'),
 'runtime_temp', has_database_privilege('khedmah_app','khedmah','TEMP'),
 'runtime_schema_create', has_schema_privilege('khedmah_app','public','CREATE'),
 'migration_create', has_database_privilege('khedmah_migrator','khedmah','CREATE'),
 'migration_schema_create', has_schema_privilege('khedmah_migrator','public','CREATE'));
"""
MIGRATOR_SQL = """
BEGIN;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM PUBLIC;
SET LOCAL ROLE khedmah_migration_role;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM PUBLIC;
COMMIT;
BEGIN;
CREATE TABLE public.khedmah_bootstrap_probe (id integer);
ROLLBACK;
SELECT json_build_object('database', current_database(), 'user', current_user,
 'probe_absent', to_regclass('public.khedmah_bootstrap_probe') IS NULL);
"""
RUNTIME_SQL = """
BEGIN;
DO $probe$ BEGIN
  BEGIN
    CREATE TABLE public.khedmah_bootstrap_probe (id integer);
    RAISE EXCEPTION 'RUNTIME_DDL_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    CREATE SCHEMA khedmah_bootstrap_probe;
    RAISE EXCEPTION 'RUNTIME_SCHEMA_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $probe$;
ROLLBACK;
SELECT json_build_object('database', current_database(), 'user', current_user,
 'probe_absent', to_regclass('public.khedmah_bootstrap_probe') IS NULL);
"""


class Stop(RuntimeError):
    pass


def require(ok, code):
    if not ok:
        raise Stop(code)


def emit(stage, **fields):
    print(json.dumps({'stage': stage, **fields}, sort_keys=True), flush=True)


def validate_target(project, sql):
    require(project.get('projectId') == PROJECT and str(project.get('projectNumber')) == NUMBER
            and project.get('parent') == {'type': 'organization', 'id': ORGANIZATION}
            and project.get('lifecycleState') == 'ACTIVE', 'PROJECT_IDENTITY_MISMATCH')
    require(sql.get('name') == INSTANCE and sql.get('project') == PROJECT
            and sql.get('region') == REGION and sql.get('connectionName') == CONNECTION
            and sql.get('state') == 'RUNNABLE' and sql.get('databaseVersion') == 'POSTGRES_16',
            'SQL_IDENTITY_MISMATCH')
    settings = sql.get('settings', {})
    require(settings.get('connectorEnforcement') == 'REQUIRED'
            and not settings.get('ipConfiguration', {}).get('authorizedNetworks'), 'SQL_CONNECTOR_MISMATCH')


def validate_initial_users(users):
    require(isinstance(users, list) and all(isinstance(user, dict) for user in users),
            'SQL_USER_INVENTORY_INVALID')
    require(len(users) == 1 and users[0].get('name') == 'postgres',
            'SQL_USERS_ALREADY_PRESENT_RECONCILE')
    # SQL Admin defines BUILT_IN as the default when type is omitted.
    # https://docs.cloud.google.com/sql/docs/postgres/admin-api/rest/v1beta4/users
    # Default only an absent key; explicit null/empty/unknown/IAM types still stop.
    require(users[0].get('type', 'BUILT_IN') == 'BUILT_IN',
            'SQL_POSTGRES_TYPE_UNEXPECTED_RECONCILE')


def validate_empty(data):
    require(data.get('database') == DATABASE and data.get('user') == 'postgres'
            and all(type(data.get(k)) is int and data[k] == 0 for k in
                    ('relations', 'routines', 'schemas', 'roles')), 'DATABASE_NOT_FRESH')


def validate_roles(data):
    rows = data.get('roles') or []
    expected = set(USERS) | set(USERS.values())
    require(data.get('database') == DATABASE and len(rows) == 4
            and {r.get('name') for r in rows} == expected, 'SQL_ROLE_SET_MISMATCH')
    for r in rows:
        require(r.get('login') is (r['name'] in USERS) and all(r.get(k) is False for k in
                ('super', 'createdb', 'createrole', 'replication', 'bypassrls')), 'SQL_ROLE_PRIVILEGED')
    memberships = data.get('memberships') or []
    require(len(memberships) == 2 and {(x.get('member'), x.get('role')) for x in memberships}
            == set(USERS.items()), 'SQL_MEMBERSHIP_MISMATCH')
    require(all(x.get('admin') is False and x.get('inherit') is True and x.get('set') is True
                for x in memberships), 'SQL_MEMBERSHIP_OPTIONS_MISMATCH')
    for k in ('runtime_connect', 'migration_create', 'migration_schema_create'):
        require(data.get(k) is True, 'SQL_REQUIRED_PRIVILEGE_MISSING')
    for k in ('runtime_create', 'runtime_temp', 'runtime_schema_create'):
        require(data.get(k) is False, 'RUNTIME_DDL_PRIVILEGE_PRESENT')


def credential_url(user, password):
    require(user in USERS and re.fullmatch('[0-9a-f]{64}', password), 'CREDENTIAL_FORMAT_REJECTED')
    return f'postgresql://{user}:{password}@localhost/{DATABASE}'


def allowed_request(method, url):
    users = SQL_BASE + f'/instances/{INSTANCE}/users'
    if (method, url) == ('PUT', users + '?name=postgres') or (method, url) == ('POST', users):
        return True
    if method == 'GET' and re.fullmatch(re.escape(SQL_BASE) + r'/operations/[a-zA-Z0-9-]+', url):
        return True
    for name in SECRET_USERS:
        path = SM_BASE + name
        if (method, url) in (('POST', path + ':addVersion'), ('POST', path + ':testIamPermissions')):
            return True
        if method == 'GET' and re.fullmatch(re.escape(path) + r'/versions/[1-9][0-9]*:access', url):
            return True
    return False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Runner:
    def __init__(self):
        self.env = dict(os.environ, CLOUDSDK_CORE_LOG_HTTP='false',
                        CLOUDSDK_CORE_USER_OUTPUT_ENABLED='true', CLOUDSDK_CORE_DISABLE_PROMPTS='true')
        require(not any(k.startswith('CLOUDSDK_API_ENDPOINT_OVERRIDES_') and v for k, v in self.env.items()),
                'ENDPOINT_OVERRIDE_REJECTED')
        self.token = None
        self.work = None
        self.proxy = None
        self.passwords = {}
        self.stage = 'PREFLIGHT'
        self.versions = {}
        self.lock = None

    def cloud(self, *args):
        p = subprocess.run(['gcloud', *args, '--project=' + PROJECT, '--account=' + ACCOUNT,
                            '--user-output-enabled', '--verbosity=error'], env=self.env,
                           capture_output=True, text=True, timeout=90, stdin=subprocess.DEVNULL)
        require(p.returncode == 0, 'GCLOUD_' + args[0].upper() + '_FAILED')
        return p.stdout.strip()

    def request(self, method, url, body=None):
        require(allowed_request(method, url), 'API_TARGET_REJECTED')
        request = urllib.request.Request(url, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=90) as response:
                data = response.read(1048577)
                require(len(data) <= 1048576, 'API_RESPONSE_TOO_LARGE')
                return json.loads(data)
        except urllib.error.HTTPError as exc:
            raise Stop('API_HTTP_' + str(exc.code) + '_RECONCILE_BEFORE_RETRY') from None

    def journal(self, stage):
        self.stage = stage
        data = {'project': PROJECT, 'instance': INSTANCE, 'stage': stage,
                'passwords': self.passwords, 'versions': self.versions}
        path = self.work / 'recovery.next'
        with path.open('w') as stream:
            os.chmod(path, 0o600)
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        path.replace(self.work / 'recovery.json')
        emit(stage)

    def operation(self, operation, kind):
        deadline = time.monotonic() + 300
        name = operation.get('name', '')
        require(re.fullmatch('[a-zA-Z0-9-]+', name), 'SQL_OPERATION_NAME_INVALID')
        while True:
            require(operation.get('name') == name and operation.get('targetProject') == PROJECT
                    and operation.get('targetId') == INSTANCE and operation.get('operationType') == kind,
                    'SQL_OPERATION_TARGET_MISMATCH')
            require(not operation.get('error'), 'SQL_OPERATION_FAILED_RECONCILE_BEFORE_RETRY')
            if operation.get('status') == 'DONE':
                return
            require(operation.get('status') in ('PENDING', 'RUNNING'), 'SQL_OPERATION_STATUS_INVALID')
            require(time.monotonic() < deadline, 'SQL_OPERATION_TIMEOUT_RECONCILE_BEFORE_RETRY')
            time.sleep(2)
            operation = self.request('GET', SQL_BASE + '/operations/' + name)

    def set_postgres_password(self):
        self.operation(self.request('PUT', SQL_BASE + f'/instances/{INSTANCE}/users?name=postgres',
            {'name': 'postgres', 'password': self.passwords['postgres']}), 'UPDATE_USER')

    def sql(self, user, statement):
        require(user in ('postgres', *USERS), 'SQL_USER_REJECTED')
        pgpass = self.work / 'pgpass'
        pgpass.write_text(f'127.0.0.1:{PORT}:{DATABASE}:{user}:{self.passwords[user]}\n')
        pgpass.chmod(0o600)
        env = {k: v for k, v in self.env.items() if not k.startswith('PG')}
        env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT='10', PGSSLMODE='disable',
                   PGOPTIONS='-c role=none -c search_path=pg_catalog -c statement_timeout=30000 -c lock_timeout=5000')
        p = subprocess.run(['psql', '-X', '-w', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', PORT,
            '-U', user, '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'],
            input=statement, capture_output=True, text=True, timeout=120, env=env)
        require(p.returncode == 0, 'SQL_STAGE_FAILED_' + self.stage + '_RECONCILE_BEFORE_RETRY')
        return p.stdout.strip()

    def preflight(self):
        require(shutil.which('psql') and shutil.which('cloud-sql-proxy'), 'PSQL_AND_PROXY_REQUIRED')
        for key in ('impersonate_service_account', 'access_token_file', 'credential_file_override'):
            require(self.cloud('config', 'get-value', 'auth/' + key) in ('', '(unset)'), 'AUTH_OVERRIDE_REJECTED')
        project = json.loads(self.cloud('projects', 'describe', PROJECT, '--format=json'))
        instance = json.loads(self.cloud('sql', 'instances', 'describe', INSTANCE, '--format=json'))
        validate_target(project, instance)
        users = json.loads(self.cloud('sql', 'users', 'list', '--instance=' + INSTANCE, '--format=json'))
        validate_initial_users(users)
        for resource in ('services', 'jobs'):
            require(json.loads(self.cloud('run', resource, 'list', '--region=' + REGION,
                                           '--format=json')) == [], 'CLOUD_RUN_ALREADY_PRESENT_RECONCILE')
        self.token = self.cloud('auth', 'print-access-token')
        require(self.token and not any(c.isspace() for c in self.token), 'TOKEN_UNAVAILABLE')
        for name in SECRET_USERS:
            metadata = json.loads(self.cloud('secrets', 'describe', name, '--format=json'))
            require(metadata.get('name') == f'projects/{NUMBER}/secrets/{name}', 'SECRET_IDENTITY_MISMATCH')
            require(json.loads(self.cloud('secrets', 'versions', 'list', '--secret=' + name,
                                            '--format=json')) == [], 'SECRET_ALREADY_POPULATED_RECONCILE')
            permissions = self.request('POST', SM_BASE + name + ':testIamPermissions',
                                       {'permissions': sorted(PERMISSIONS)})
            require(PERMISSIONS <= set(permissions.get('permissions', [])), 'SECRET_PERMISSIONS_MISSING')
        emit('PREVIEW_V2_DATABASE_PREFLIGHT_PASSED', project=PROJECT)

    def start_proxy(self):
        env = {k: v for k, v in self.env.items() if not k.startswith(('CSQL_PROXY_', 'GOOGLE_'))}
        env['CSQL_PROXY_TOKEN'] = self.token
        log = self.work / 'proxy.log'
        with log.open('w') as output:
            self.proxy = subprocess.Popen(['cloud-sql-proxy', CONNECTION, '--address=127.0.0.1',
                                           '--port=' + PORT], stdout=output, stderr=subprocess.STDOUT, env=env)
        deadline = time.monotonic() + 60
        while 'ready for new connections' not in log.read_text().lower():
            require(self.proxy.poll() is None and time.monotonic() < deadline, 'SQL_PROXY_NOT_READY')
            time.sleep(0.25)
        require(self.proxy.poll() is None, 'SQL_PROXY_EXITED')

    def publish(self, name, user):
        require(name in SECRET_USERS and SECRET_USERS[name] == user, 'SECRET_USER_BINDING_REJECTED')
        require(json.loads(self.cloud('secrets', 'versions', 'list', '--secret=' + name,
                                       '--format=json')) == [], 'SECRET_ALREADY_POPULATED_RECONCILE')
        payload = credential_url(user, self.passwords[user]).encode()
        self.journal('SECRET_VERSION_ATTEMPT_' + name)
        version = self.request('POST', SM_BASE + name + ':addVersion',
                               {'payload': {'data': base64.b64encode(payload).decode()}})
        resource = version.get('name', '')
        require(re.fullmatch(f'projects/{NUMBER}/secrets/{name}/versions/[1-9][0-9]*', resource)
                and version.get('state') == 'ENABLED', 'SECRET_VERSION_RESPONSE_MISMATCH')
        self.versions[name] = resource.rsplit('/', 1)[1]
        self.journal('SECRET_VERSION_CREATED_' + name)
        readback = self.request('GET', 'https://secretmanager.googleapis.com/v1/' + resource + ':access')
        require(readback.get('name') == resource and hmac.compare_digest(
            base64.b64decode(readback.get('payload', {}).get('data', ''), validate=True), payload),
            'SECRET_PAYLOAD_READBACK_MISMATCH')
        emit('SECRET_VERSION_VERIFIED', secret=name, version=self.versions[name])

    def apply(self):
        root = Path.home() / 'khedmah-preview-v2-database-runs'
        require(not root.is_symlink(), 'RECOVERY_DIRECTORY_SYMLINK_REJECTED')
        root.mkdir(mode=0o700, exist_ok=True)
        os.chmod(root, 0o700)
        self.lock = (root / '.lock').open('a')
        try:
            fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop('DATABASE_BATCH_ALREADY_RUNNING') from None
        require(not any(p.name != '.lock' for p in root.iterdir()), 'PREVIOUS_DATABASE_RUN_REQUIRES_RECONCILIATION')
        self.preflight()
        self.work = Path(tempfile.mkdtemp(prefix='run-', dir=root))
        self.passwords = {user: secrets.token_hex(32) for user in ('postgres', *USERS)}
        self.journal('POSTGRES_BOOTSTRAP_PASSWORD_ATTEMPT')
        self.set_postgres_password()
        self.start_proxy()
        validate_empty(json.loads(self.sql('postgres', 'BEGIN READ ONLY;\n' + EMPTY_SQL + '\nROLLBACK;')))
        self.journal('SQL_GROUP_ROLES_ATTEMPT')
        self.sql('postgres', PREPARE_SQL)
        for user, role in USERS.items():
            self.journal('SQL_LOGIN_ATTEMPT_' + user)
            self.operation(self.request('POST', SQL_BASE + f'/instances/{INSTANCE}/users',
                {'name': user, 'password': self.passwords[user], 'type': 'BUILT_IN',
                 'databaseRoles': [role]}), 'CREATE_USER')
        validate_roles(json.loads(self.sql('postgres', ROLE_CHECK_SQL)))
        self.journal('MIGRATOR_DEFAULTS_AND_LOGIN_PROBES')
        for user, statement in [('khedmah_migrator', MIGRATOR_SQL), ('khedmah_app', RUNTIME_SQL)]:
            proof = json.loads(self.sql(user, statement))
            require(proof == {'database': DATABASE, 'user': user, 'probe_absent': True}, 'SQL_LOGIN_PROBE_MISMATCH')
            emit('SQL_LOGIN_VERIFIED', user=user)
        validate_roles(json.loads(self.sql('postgres', ROLE_CHECK_SQL)))
        for name, user in SECRET_USERS.items():
            self.publish(name, user)
        for name, version in self.versions.items():
            latest = json.loads(self.cloud('secrets', 'versions', 'describe', 'latest',
                                           '--secret=' + name, '--format=json'))
            require(latest.get('name') == f'projects/{NUMBER}/secrets/{name}/versions/{version}'
                    and latest.get('state') == 'ENABLED', 'SECRET_LATEST_BINDING_CHANGED')
        self.passwords['postgres'] = secrets.token_hex(32)
        self.journal('POSTGRES_BOOTSTRAP_CREDENTIAL_CONTAINMENT')
        self.set_postgres_password()
        self.journal('PREVIEW_V2_DATABASE_IDENTITIES_VERIFIED_SCHEMA_PENDING')
        emit('PREVIEW_V2_DATABASE_IDENTITIES_VERIFIED_SCHEMA_PENDING', project=PROJECT,
             versions=self.versions, schema_migrated=False, runtime_object_grants_ready=False,
             application_deployed=False, floot_connected=False)

    def close(self):
        if self.proxy and self.proxy.poll() is None:
            self.proxy.terminate()
            try:
                self.proxy.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proxy.kill()
                self.proxy.wait(timeout=10)
        if self.lock:
            self.lock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    if not args.apply:
        emit('PLAN_ONLY_NO_MUTATION', project=PROJECT, instance=INSTANCE, users=USERS,
             secrets=list(SECRET_USERS), schema_migrations=False, runtime_object_grants=False)
        return
    runner = Runner()
    try:
        runner.apply()
    except Exception as exc:
        print('STOP: ' + (str(exc) if isinstance(exc, Stop) else 'EXECUTION_FAILED_RECONCILE_BEFORE_RETRY'),
              file=sys.stderr)
        if runner.work:
            print('PRIVATE_RECOVERY_DIRECTORY=' + str(runner.work), file=sys.stderr)
            print('Do not paste recovery files or rerun; send only this stage/error.', file=sys.stderr)
        raise SystemExit(1)
    finally:
        runner.close()
    if runner.work:
        shutil.rmtree(runner.work)


if __name__ == '__main__':
    main()
