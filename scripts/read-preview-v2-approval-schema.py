#!/usr/bin/env python3
"""Read Preview V2's 035/036/037 catalog subset through the frozen SQL transport.

The pinned shell runner is data only: extract its catalog CTE, never execute
its shell or migration branches. No application rows or definitions are printed.
"""
import base64
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

REPO = 'khedma-sy/khedmah-digital-v1'
READER_BLOB = '1f1565473cc1ab8d8e98791f0fc4af440f9d3d32'
READER_SHA256 = '154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11'
RUNNER_BLOB = 'f10c40a51c23e1969c06d7281cdcfd7e0ea948ef'
RUNNER_SHA256 = '248fad2079180ed751293a36709c4faf65f0872699576a651b8ab4c4d5340230'
CTE_START = 'WITH attributes AS ('
CTE_END = "SELECT classification='prerequisite-invalid' AS prerequisite_invalid,"
FLAGS = ('required_relation_anchors', 'role_column_exact', 'quota_columns_exact',
         'media_columns_exact', 'role_predecessor', 'role_target', 'asset_predecessor',
         'asset_target', 'private_constraint_absent', 'private_constraint_target', 'quota_target')


def stop(code):
    raise SystemExit('STOP: ' + code)


def fetch_blob(blob, checksum):
    env = {k: v for k, v in os.environ.items() if k not in ('GH_DEBUG', 'DEBUG')}
    result = subprocess.run(['gh', 'api', '--hostname', 'github.com',
        'repos/' + REPO + '/git/blobs/' + blob], capture_output=True, timeout=60, env=env)
    if result.returncode or len(result.stdout) > 262144:
        stop('PINNED_SOURCE_READ_FAILED')
    try:
        value = json.loads(result.stdout)
        if value.get('sha') != blob or value.get('encoding') != 'base64':
            stop('PINNED_SOURCE_METADATA_MISMATCH')
        data = base64.b64decode(''.join(value['content'].split()), validate=True)
        actual_blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if (actual_blob != blob or hashlib.sha256(data).hexdigest() != checksum
                or value.get('size') != len(data)):
            stop('PINNED_SOURCE_BYTES_MISMATCH')
        return data
    except (ValueError, KeyError, TypeError, AttributeError):
        stop('PINNED_SOURCE_RESPONSE_INVALID')


def build_sql(source):
    if hashlib.sha256(source).hexdigest() != RUNNER_SHA256:
        stop('RUNNER_CHECKSUM_MISMATCH')
    text = source.decode('utf-8')
    if text.count(CTE_START) != 1 or text.count(CTE_END) != 1:
        stop('CATALOG_CTE_BOUNDARY_MISMATCH')
    start, end = text.index(CTE_START), text.index(CTE_END)
    if end <= start:
        stop('CATALOG_CTE_BOUNDARY_MISMATCH')
    cte = text[start:end]
    return """BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $identity$
BEGIN
 IF current_database()<>'khedmah' OR current_user<>'khedmah_migrator'
    OR session_user<>'khedmah_migrator'
    OR current_setting('transaction_read_only')<>'on'
    OR current_setting('transaction_isolation')<>'repeatable read'
    OR current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
   RAISE EXCEPTION 'APPROVAL_CATALOG_IDENTITY_MISMATCH';
 END IF;
END $identity$;
""" + cte + """SELECT pg_catalog.json_build_object(
 'database',current_database(),'user',current_user,'session_user',session_user,
 'read_only',current_setting('transaction_read_only'),
 'isolation',current_setting('transaction_isolation'),
 'server_version_num',current_setting('server_version_num')::integer,
 'classification',state.classification,
 'required_relation_anchors',object_state.target,
 'role_column_exact',column_state.role_exact,'quota_columns_exact',column_state.quota_exact,
 'media_columns_exact',column_state.media_exact,
 'role_predecessor',role_state.predecessor,'role_target',role_state.target,
 'asset_predecessor',asset_state.predecessor,'asset_target',asset_state.target,
 'private_constraint_absent',private_state.absent,'private_constraint_target',private_state.target,
 'quota_target',quota_state.target)
FROM state,column_state,role_state,asset_state,private_state,quota_state,object_state;
ROLLBACK;
"""


def load_sources(work):
    reader_bytes = fetch_blob(READER_BLOB, READER_SHA256)
    sql = build_sql(fetch_blob(RUNNER_BLOB, RUNNER_SHA256))
    path = work / 'pinned_reader.py'
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(reader_bytes)
    spec = importlib.util.spec_from_file_location('preview_approval_transport', path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    return reader, sql


def validate_result(value):
    identity = dict(database='khedmah', user='khedmah_migrator', session_user='khedmah_migrator',
                    read_only='on', isolation='repeatable read')
    keys = {*identity, 'server_version_num', 'classification', *FLAGS}
    if (not isinstance(value, dict) or set(value) != keys
            or any(value.get(k) != v for k, v in identity.items())
            or type(value['server_version_num']) is not int
            or not 160000 <= value['server_version_num'] < 170000
            or value['classification'] not in ('prerequisite-invalid', 'invalid', 'predecessor', 'role-target', 'target')
            or any(type(value[name]) is not bool for name in FLAGS)):
        stop('APPROVAL_CATALOG_RESPONSE_INVALID')
    return value


def read_catalog(reader, work, password, sql):
    if not re.fullmatch(r'[0-9a-f]{64}', password):
        stop('PASSWORD_FORMAT_REJECTED')
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / 'approval.pgpass'
    with pgpass.open('x') as stream:
        os.chmod(pgpass, 0o600)
        stream.write(socket_dir.replace('\\', '\\\\').replace(':', '\\:')
            + ':5432:khedmah:khedmah_migrator:' + password + '\n')
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'CSQL_PROXY_', 'GOOGLE_'))}
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT='10', PGSSLMODE='disable',
        PGOPTIONS='-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on '
                  '-c statement_timeout=30000 -c lock_timeout=5000')
    try:
        result = subprocess.run(['psql', '-X', '-w', '-q', '-A', '-t', '-h', socket_dir,
            '-p', '5432', '-U', reader.USER, '-d', reader.DATABASE,
            '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'], input=sql, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60, env=env)
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or len(result.stdout) > 16384:
        stop('APPROVAL_CATALOG_READ_FAILED_OR_TOO_LARGE')
    try:
        return validate_result(json.loads(result.stdout))
    except (ValueError, TypeError, KeyError, AttributeError):
        stop('APPROVAL_CATALOG_RESPONSE_INVALID')


def inspect():
    if any(not shutil.which(name) for name in ('gh', 'gcloud', 'psql', 'cloud-sql-proxy')):
        stop('REQUIRED_INSPECTION_TOOLS_MISSING')
    with tempfile.TemporaryDirectory(prefix='pv2-', dir='/tmp') as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, sql = load_sources(work)
        reader.preflight()
        reader.validate_instance(reader.cloud('sql', 'instances', 'describe', reader.INSTANCE,
            fields='name,project,region,connectionName,state,databaseVersion'))
        version = reader.cloud('secrets', 'versions', 'describe', '1', '--secret=' + reader.SECRET,
                               fields='name,state')
        if version != {'name': reader.RESOURCE, 'state': 'ENABLED'}:
            stop('MIGRATION_SECRET_VERSION_ONE_NOT_VERIFIED')
        token = reader.cloud('auth', 'print-access-token').decode('ascii').strip()
        if not token or any(c.isspace() for c in token):
            stop('TOKEN_UNAVAILABLE')
        password = reader.read_password(token)
        proxy = None
        socket = work / reader.CONNECTION / '.s.PGSQL.5432'
        if len(str(socket).encode()) >= 104:
            stop('PRIVATE_SOCKET_PATH_TOO_LONG')
        try:
            with (work / 'proxy.log').open('x') as log:
                os.chmod(work / 'proxy.log', 0o600)
                proxy = subprocess.Popen(['cloud-sql-proxy', reader.CONNECTION, '--unix-socket=' + str(work)],
                    stdout=log, stderr=subprocess.STDOUT, env=reader.proxy_environment(token))
                deadline = time.monotonic() + 45
                while not socket.exists():
                    if proxy.poll() is not None or time.monotonic() >= deadline:
                        stop('PRIVATE_SQL_PROXY_NOT_READY')
                    time.sleep(0.25)
                if proxy.poll() is not None or not stat.S_ISSOCK(socket.stat().st_mode):
                    stop('PRIVATE_SQL_PROXY_SOCKET_INVALID')
                catalog = read_catalog(reader, work, password, sql)
        finally:
            reader.stop_proxy(proxy)
    print(json.dumps(dict(stage='PREVIEW_V2_APPROVAL_SCHEMA_CATALOG_READ_COMPLETED',
        project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE, catalog=catalog,
        reader_git_blob=READER_BLOB, reader_sha256=READER_SHA256,
        runner_git_blob=RUNNER_BLOB, runner_sha256=RUNNER_SHA256,
        inspection_sql_sha256=hashlib.sha256(sql.encode()).hexdigest(),
        migration_secret_version='1', secret_payload_access=True, credential_values_printed=False,
        application_data_rows_read=False, cloud_resource_mutation=False, schema_mutation=False,
        role_mutation=False, application_data_mutation=False, schema_readiness_verified=False,
        release_gates_verified=False, application_deployment_performed=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] != ['--inspect']:
        stop('USE_INSPECT_ONLY')
    os.umask(0o077)
    try:
        inspect()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop('LOCAL_OR_APPROVAL_CATALOG_READ_FAILURE')
