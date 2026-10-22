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
PREDECESSOR_BLOB = '83d1f28a54d85498ad2bfbf4974f37cdbf0b5d13'
PREDECESSOR_SHA256 = '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d'
PREDECESSOR_BODY_SHA256 = '7cfb695387b6c31296461911d924da088d6232f8a2d901a5572e9e5003dd585b'
TARGET_BODY_SHA256 = '3d1a27bcb76579aa290299609f015efb6c34094647ed11d8c7bd7ea3e270a002'
CTE_START = 'WITH attributes AS ('
CTE_END = "SELECT classification='prerequisite-invalid' AS prerequisite_invalid,"
FLAGS = ('required_relation_anchors', 'role_column_exact', 'quota_columns_exact',
         'media_columns_exact', 'role_predecessor', 'role_target', 'asset_predecessor',
         'asset_target', 'private_constraint_absent', 'private_constraint_target', 'quota_target')
ROUTINE_CHECKS = (
    ('identity_arguments', "pg_get_function_identity_arguments(p.oid)=''"),
    ('kind', "p.prokind='f'"), ('language', "l.lanname='plpgsql'"),
    ('volatility', "p.provolatile='v'"), ('parallel', "p.proparallel='u'"),
    ('strict', 'NOT p.proisstrict'), ('leakproof', 'NOT p.proleakproof'),
    ('argument_defaults', 'p.pronargdefaults=0'), ('variadic', 'p.provariadic=0'),
    ('security_definer', 'p.prosecdef=false'), ('settings', 'p.proconfig IS NULL'),
    ('returns_set', 'p.proretset=false'), ('return_type', "p.prorettype='pg_catalog.trigger'::regtype"),
    ('owner', "pg_get_userbyid(p.proowner)='khedmah_migrator'"))
TRIGGER_CHECKS = (
    ('internal', 'NOT t.tgisinternal'), ('enabled', "t.tgenabled='O'"),
    ('type', 't.tgtype=7'), ('arguments', 't.tgnargs=0'),
    ('function', "t.tgfoid=to_regprocedure('public.enforce_ad_free_slot_limit()')"),
    ('constraint', 't.tgconstraint=0'), ('deferrable', 'NOT t.tgdeferrable'),
    ('initially_deferred', 'NOT t.tginitdeferred'), ('attributes', "t.tgattr=''::int2vector"),
    ('condition', 't.tgqual IS NULL'), ('old_transition_table', 't.tgoldtable IS NULL'),
    ('new_transition_table', 't.tgnewtable IS NULL'), ('parent', 't.tgparentid=0'))


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


def build_quota_sql(source, predecessor):
    sql = build_sql(source)
    if hashlib.sha256(predecessor).hexdigest() != PREDECESSOR_SHA256:
        stop('PREDECESSOR_CHECKSUM_MISMATCH')
    text, previous = source.decode('utf-8'), predecessor.decode('utf-8')
    declaration = 'CREATE FUNCTION enforce_ad_free_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$'
    if (text.count('AND p.prosrc=$quota$') != 1 or text.count('$quota$') != 2
            or previous.count(declaration) != 1):
        stop('QUOTA_BODY_BOUNDARY_MISMATCH')
    remainder = previous.split(declaration, 1)[1]
    if '$$;' not in remainder:
        stop('QUOTA_BODY_BOUNDARY_MISMATCH')
    body_025, body_036 = remainder.split('$$;', 1)[0], text.split('$quota$')[1]
    if (hashlib.sha256(body_025.encode()).hexdigest() != PREDECESSOR_BODY_SHA256
            or hashlib.sha256(body_036.encode()).hexdigest() != TARGET_BODY_SHA256):
        stop('QUOTA_BODY_CHECKSUM_MISMATCH')
    routine_checks, trigger_checks = (
        ',\n'.join(f"({i},'{name}',({predicate}))" for i, (name, predicate) in enumerate(checks))
        for checks in (ROUTINE_CHECKS, TRIGGER_CHECKS))
    diagnostics = f""", quota_routine_rows AS (
 SELECT p.prosrc=$quota025${body_025}$quota025$ AS body_025_exact,
        p.prosrc=$quota036${body_036}$quota036$ AS body_036_exact,
        ARRAY(SELECT label FROM (VALUES {routine_checks}) AS checks(ordinal,label,passed)
              WHERE passed IS NOT TRUE ORDER BY ordinal) AS failed_checks
 FROM pg_catalog.pg_proc p LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid=to_regprocedure('public.enforce_ad_free_slot_limit()')
), quota_routine_diagnostics AS (
 SELECT count(*)::integer AS routine_count,
        CASE WHEN count(*)=1 THEN bool_and(body_025_exact) END AS body_025_exact,
        CASE WHEN count(*)=1 THEN bool_and(body_036_exact) END AS body_036_exact,
        CASE WHEN count(*)=0 THEN ARRAY['missing']::text[]
             WHEN count(*)>1 THEN ARRAY['ambiguous']::text[]
             ELSE (SELECT failed_checks FROM quota_routine_rows LIMIT 1) END AS routine_failed_checks
 FROM quota_routine_rows
), quota_trigger_rows AS (
 SELECT ARRAY(SELECT label FROM (VALUES {trigger_checks}) AS checks(ordinal,label,passed)
              WHERE passed IS NOT TRUE ORDER BY ordinal) AS failed_checks
 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('public.ad_free_slots')
   AND t.tgname='ad_free_slot_limit_before_insert'
), quota_trigger_diagnostics AS (
 SELECT count(*)::integer AS named_trigger_count,
        CASE WHEN count(*)=0 THEN ARRAY['missing']::text[]
             WHEN count(*)>1 THEN ARRAY['ambiguous']::text[]
             ELSE (SELECT failed_checks FROM quota_trigger_rows LIMIT 1) END AS trigger_failed_checks
 FROM quota_trigger_rows
)
"""
    select_marker = 'SELECT pg_catalog.json_build_object(\n'
    quota_marker = " 'quota_target',quota_state.target)\n"
    if sql.count(select_marker) != 1 or sql.count(quota_marker) != 1:
        stop('QUOTA_BODY_BOUNDARY_MISMATCH')
    return sql.replace(select_marker, diagnostics + select_marker, 1).replace(quota_marker, """ 'quota_target',quota_state.target,
 'quota_diagnostics',(SELECT pg_catalog.json_build_object(
   'routine_count',routine_count,'body_025_exact',body_025_exact,'body_036_exact',body_036_exact,
   'routine_failed_checks',routine_failed_checks,'named_trigger_count',named_trigger_count,
   'trigger_failed_checks',trigger_failed_checks,
   'user_insert_trigger_count',(SELECT count(*)::integer FROM pg_catalog.pg_trigger t
     WHERE t.tgrelid=to_regclass('public.ad_free_slots')
       AND NOT t.tgisinternal AND (t.tgtype::integer & 4)=4),
   'insert_rule_count',(SELECT count(*)::integer FROM pg_catalog.pg_rewrite r
     WHERE r.ev_class=to_regclass('public.ad_free_slots') AND r.ev_type='3'))
  FROM quota_routine_diagnostics,quota_trigger_diagnostics))
""", 1)


def load_sources(work, quota=False):
    reader_bytes = fetch_blob(READER_BLOB, READER_SHA256)
    source = fetch_blob(RUNNER_BLOB, RUNNER_SHA256)
    sql = (build_quota_sql(source, fetch_blob(PREDECESSOR_BLOB, PREDECESSOR_SHA256))
           if quota else build_sql(source))
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


def validate_quota_result(value):
    code = 'APPROVAL_QUOTA_DIAGNOSTIC_RESPONSE_INVALID'
    if not isinstance(value, dict) or 'quota_diagnostics' not in value:
        stop(code)
    validate_result({k: v for k, v in value.items() if k != 'quota_diagnostics'})
    detail = value['quota_diagnostics']
    counts = ('routine_count', 'named_trigger_count', 'user_insert_trigger_count', 'insert_rule_count')
    bodies = ('body_025_exact', 'body_036_exact')
    if (not isinstance(detail, dict)
            or set(detail) != {*counts, *bodies, 'routine_failed_checks', 'trigger_failed_checks'}
            or any(type(detail[k]) is not int or not 0 <= detail[k] <= 2147483647 for k in counts)):
        stop(code)
    for count_key, failure_key, checks in (
            ('routine_count', 'routine_failed_checks', ROUTINE_CHECKS),
            ('named_trigger_count', 'trigger_failed_checks', TRIGGER_CHECKS)):
        count, failures = detail[count_key], detail[failure_key]
        if type(failures) is not list or any(type(name) is not str for name in failures):
            stop(code)
        if count != 1:
            if failures != (['missing'] if count == 0 else ['ambiguous']):
                stop(code)
        elif failures != [name for name, _ in checks if name in failures]:
            stop(code)
    if detail['routine_count'] == 1:
        if (any(type(detail[k]) is not bool for k in bodies)
                or all(detail[k] for k in bodies)):
            stop(code)
    elif any(detail[k] is not None for k in bodies):
        stop(code)
    target = (detail['routine_count'] == 1 and detail['body_036_exact'] is True
        and not detail['routine_failed_checks'] and detail['named_trigger_count'] == 1
        and not detail['trigger_failed_checks'] and detail['user_insert_trigger_count'] == 1
        and detail['insert_rule_count'] == 0)
    if target is not value['quota_target']:
        stop(code)
    return value


def read_catalog(reader, work, password, sql, quota=False):
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
        value = json.loads(result.stdout)
        return validate_quota_result(value) if quota else validate_result(value)
    except (ValueError, TypeError, KeyError, AttributeError):
        stop('APPROVAL_CATALOG_RESPONSE_INVALID')


def inspect(quota=False):
    if any(not shutil.which(name) for name in ('gh', 'gcloud', 'psql', 'cloud-sql-proxy')):
        stop('REQUIRED_INSPECTION_TOOLS_MISSING')
    with tempfile.TemporaryDirectory(prefix='pv2-', dir='/tmp') as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, sql = load_sources(work, quota=quota)
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
                catalog = read_catalog(reader, work, password, sql, quota=quota)
        finally:
            reader.stop_proxy(proxy)
    receipt = dict(stage='PREVIEW_V2_APPROVAL_SCHEMA_CATALOG_READ_COMPLETED',
        project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE, catalog=catalog,
        reader_git_blob=READER_BLOB, reader_sha256=READER_SHA256,
        runner_git_blob=RUNNER_BLOB, runner_sha256=RUNNER_SHA256,
        inspection_sql_sha256=hashlib.sha256(sql.encode()).hexdigest(),
        migration_secret_version='1', secret_payload_access=True, credential_values_printed=False,
        application_data_rows_read=False, cloud_resource_mutation=False, schema_mutation=False,
        role_mutation=False, application_data_mutation=False, schema_readiness_verified=False,
        release_gates_verified=False, application_deployment_performed=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if quota:
        receipt.update(stage='PREVIEW_V2_APPROVAL_QUOTA_DIAGNOSTIC_READ_COMPLETED',
            predecessor_git_blob=PREDECESSOR_BLOB, predecessor_sha256=PREDECESSOR_SHA256,
            predecessor_body_sha256=PREDECESSOR_BODY_SHA256, target_body_sha256=TARGET_BODY_SHA256)
    print(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] not in (['--inspect'], ['--inspect-quota']):
        stop('USE_INSPECT_ONLY')
    os.umask(0o077)
    try:
        inspect(quota=sys.argv[1:] == ['--inspect-quota'])
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop('LOCAL_OR_APPROVAL_CATALOG_READ_FAILURE')
