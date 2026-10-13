#!/usr/bin/env python3
"""Apply only 033's reviewed role-check DDL in one guarded Preview transaction."""
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
SOURCE_COMMIT = '1f21edb6850caf45b457851e6f817a25098e3333'
BILLING_BLOB = 'eadbd43a8f36d0863a5066804114715192dc6afb'
BILLING_SHA256 = '779072154368aa19e5347a2ba45d796aea8ebaea098305bb33395685de4055b2'
MIGRATION_NAME = '033_billing_admin_role.sql'
MIGRATION_BLOB = '7bbdd79c5c129f41134c10ba15eedc644e396888'
MIGRATION_SHA256 = 'acc42c10459b0f90c276e843942bc712283616fc71ac854c177bb20defa34463'


def load_sources(work):
    billing = verified_module(work,'billing_contract',fetch_blob(BILLING_BLOB),BILLING_SHA256)
    taxi,fulfillment,predecessor,foundation,reader,sql025,migrations,sql029,sql030=billing.load_sources(work)
    sql033=fetch_blob(MIGRATION_BLOB).decode('utf-8')
    verify_sources(billing,taxi,fulfillment,predecessor,sql025,migrations,sql029,sql030,sql033)
    return billing,taxi,fulfillment,predecessor,foundation,reader,sql025,migrations,sql029,sql030,sql033


def verify_sources(billing,taxi,fulfillment,predecessor,sql025,migrations,sql029,sql030,sql033):
    billing.verify_sources(taxi,fulfillment,predecessor,sql025,migrations,sql029,sql030)
    if hashlib.sha256(sql033.encode()).hexdigest()!=MIGRATION_SHA256:
        stop('MIGRATION_033_CHECKSUM_MISMATCH')


def canonical_statements(sql033):
    """Keep the canonical LOCK/ALTER bytes, replacing only transaction delimiters."""
    if hashlib.sha256(sql033.encode()).hexdigest()!=MIGRATION_SHA256:
        stop('MIGRATION_033_CHECKSUM_MISMATCH')
    header,begin,rest=sql033.partition('BEGIN;\n\n')
    body,commit,tail=rest.rpartition('\nCOMMIT;\n')
    lock,separator,alter=body.partition('\n\n')
    if (not begin or not commit or tail or not separator
            or lock!='LOCK TABLE public.admin_roles IN ACCESS EXCLUSIVE MODE;'
            or alter.count('ALTER TABLE public.admin_roles')!=2
            or sql033.count('BEGIN;')!=1 or sql033.count('COMMIT;')!=1):
        stop('MIGRATION_033_TRANSACTION_MANIFEST_MISMATCH')
    return lock,alter


def role_contract(applied):
    roles=['bootstrap_admin','platform_admin','moderator']+(['billing_admin'] if applied else [])
    definition='CHECKrole=ANYARRAY['+','.join("'"+role+"'" for role in roles)+']'
    label='MIGRATION_033_TARGET_CONSTRAINT_INVALID' if applied else 'MIGRATION_033_PREDECESSOR_INVALID_NO_REPLAY'
    return """
DO $role033$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      WHERE c.conrelid='public.admin_roles'::regclass AND c.conname='admin_roles_role_check'
        AND c.contype='c' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND cardinality(c.conkey)=1 AND a.attname='role' AND NOT a.attisdropped
        AND pg_catalog.format_type(a.atttypid,a.atttypmod)='text'
        AND regexp_replace(pg_catalog.pg_get_constraintdef(c.oid),'[[:space:]()]|::text','','g')
              =$expected$EXPECTED_DEFINITION$expected$)<>1 THEN
    RAISE EXCEPTION 'GUARD_LABEL';
  END IF;
END
$role033$;
""".replace('EXPECTED_DEFINITION',definition).replace('GUARD_LABEL',label)


def retained_contract(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030):
    baseline=billing.postcondition_sql(taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030)
    old_role=billing.admin_role_predecessor_contract()
    if not baseline.endswith(old_role) or baseline.count(old_role)!=1:
        stop('MIGRATION_033_PREDECESSOR_CONTRACT_MANIFEST_MISMATCH')
    # Preserve every 030 contract except the one constraint intentionally changed by 033.
    return baseline[:-len(old_role)]


def postcondition_sql(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030,sql033):
    verify_sources(billing,taxi,fulfillment,predecessor,sql025,migrations,sql029,sql030,sql033)
    return retained_contract(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030)+role_contract(True)


def build_preflight_sql(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030,sql033):
    verify_sources(billing,taxi,fulfillment,predecessor,sql025,migrations,sql029,sql030,sql033)
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            + billing.postcondition_sql(taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030)
            + role_contract(False)+"ROLLBACK;\nSELECT 'PREVIEW_V2_BILLING_ADMIN_PREDECESSOR_ACK';\n")


def build_sql(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030,sql033):
    verify_sources(billing,taxi,fulfillment,predecessor,sql025,migrations,sql029,sql030,sql033)
    lock,alter=canonical_statements(sql033)
    return ("""BEGIN READ WRITE;
SET LOCAL search_path=public,pg_catalog;
DO $lock033$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('khedmah-nonproduction-billing-033',0));
END
$lock033$;
"""+lock+'\n'+billing.postcondition_sql(taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030)
            +role_contract(False)+"""
DO $before033$
BEGIN
  PERFORM pg_catalog.set_config('khedmah.preview_admin_role_count_before',
      (SELECT count(*)::text FROM public.admin_roles),true);
END
$before033$;
"""+alter+'\n'+postcondition_sql(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030,sql033)
            +"""
DO $after033$
BEGIN
  IF (SELECT count(*) FROM public.admin_roles) IS DISTINCT FROM
       current_setting('khedmah.preview_admin_role_count_before',true)::bigint THEN
    RAISE EXCEPTION 'MIGRATION_033_ROLE_ROW_COUNT_CHANGED';
  END IF;
END
$after033$;
COMMIT;
SELECT 'PREVIEW_V2_BILLING_ADMIN_COMMIT_ACK';
""")


def build_readback_sql(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030,sql033):
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            +postcondition_sql(billing,taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030,sql033)
            +"ROLLBACK;\nSELECT 'PREVIEW_V2_BILLING_ADMIN_READBACK_ACK';\n")


def stop(code):
    raise SystemExit("STOP: " + code)

def fetch_blob(sha):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        stop("SOURCE_BLOB_INVALID")
    env = {k: v for k, v in os.environ.items() if k not in ("GH_DEBUG", "DEBUG")}
    result = subprocess.run(["gh", "api", "--hostname", "github.com",
        "repos/" + REPO + "/git/blobs/" + sha], capture_output=True, timeout=60, env=env)
    if result.returncode or len(result.stdout) > 524288:
        stop("PINNED_SOURCE_READ_FAILED")
    try:
        value = json.loads(result.stdout)
        if value.get("sha") != sha or value.get("encoding") != "base64":
            stop("PINNED_SOURCE_IDENTITY_MISMATCH")
        data = base64.b64decode("".join(value["content"].split()), validate=True)
    except (ValueError, KeyError, TypeError, AttributeError):
        stop("PINNED_SOURCE_RESPONSE_INVALID")
    digest = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if digest != sha or value.get("size") != len(data):
        stop("PINNED_SOURCE_BYTES_MISMATCH")
    return data

def verified_module(work, name, data, checksum):
    if hashlib.sha256(data).hexdigest() != checksum:
        stop("DEPENDENCY_CHECKSUM_MISMATCH")
    path = work / (name + ".py")
    path.write_bytes(data)
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def execute_sql(reader, work, password, sql, marker):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "billing-admin.pgpass"
    with pgpass.open("x") as stream:
        os.chmod(pgpass, 0o600)
        host = socket_dir.replace("\\", "\\\\").replace(":", "\\:")
        stream.write(host + ":5432:khedmah:khedmah_migrator:" + password + "\n")
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("PG", "CSQL_PROXY_", "GOOGLE_"))}
    # Session is read-only by default; only the explicit reviewed transaction is writable.
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
               PGOPTIONS="-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on "
                         "-c statement_timeout=120000 -c lock_timeout=5000")
    try:
        result = subprocess.run(["psql", "-X", "-w", "-q", "-A", "-t",
            "-h", socket_dir, "-p", "5432", "-U", reader.USER, "-d", reader.DATABASE,
            "-v", "ON_ERROR_STOP=1", "-P", "pager=off"], input=sql,
            text=True, capture_output=True, timeout=600, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop("MIGRATION_033_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != marker:
        stop("MIGRATION_033_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")

def apply_billing_admin_role():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        billing, taxi, fulfillment, predecessor, foundation, reader, sql025, migrations, sql029, sql030, sql033 = load_sources(work)
        sql = build_sql(billing, taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030, sql033)
        reader.preflight()
        reader.validate_instance(reader.cloud("sql", "instances", "describe", reader.INSTANCE,
            fields="name,project,region,connectionName,state,databaseVersion"))
        version = reader.cloud("secrets", "versions", "describe", "1", "--secret=" + reader.SECRET,
                               fields="name,state")
        if version != {"name": reader.RESOURCE, "state": "ENABLED"}:
            stop("MIGRATION_SECRET_VERSION_ONE_NOT_VERIFIED")
        token = reader.cloud("auth", "print-access-token").decode("ascii").strip()
        if not token or any(c.isspace() for c in token):
            stop("TOKEN_UNAVAILABLE")
        password = reader.read_password(token)
        proxy = None
        socket = work / reader.CONNECTION / ".s.PGSQL.5432"
        if len(str(socket).encode()) >= 104:
            stop("PRIVATE_SOCKET_PATH_TOO_LONG")
        try:
            with (work / "proxy.log").open("x") as log:
                os.chmod(work / "proxy.log", 0o600)
                proxy = subprocess.Popen(["cloud-sql-proxy", reader.CONNECTION, "--unix-socket=" + str(work)],
                    stdout=log, stderr=subprocess.STDOUT, env=reader.proxy_environment(token))
                deadline = time.monotonic() + 45
                while not socket.exists():
                    if proxy.poll() is not None or time.monotonic() >= deadline:
                        stop("PRIVATE_SQL_PROXY_NOT_READY")
                    time.sleep(0.25)
                if proxy.poll() is not None or not stat.S_ISSOCK(socket.stat().st_mode):
                    stop("PRIVATE_SQL_PROXY_SOCKET_INVALID")
                billing.verify_result(taxi, fulfillment, predecessor, foundation, reader.read_catalog(work, password))
                execute_sql(reader, work, password, build_preflight_sql(billing, taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030, sql033),
                            "PREVIEW_V2_BILLING_ADMIN_PREDECESSOR_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_BILLING_ADMIN_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=59)), flush=True)
                execute_sql(reader, work, password, sql, "PREVIEW_V2_BILLING_ADMIN_COMMIT_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_BILLING_ADMIN_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                billing.verify_result(taxi, fulfillment, predecessor, foundation, catalog)
                execute_sql(reader, work, password, build_readback_sql(billing, taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030, sql033),
                            "PREVIEW_V2_BILLING_ADMIN_READBACK_ACK")
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_BILLING_ADMIN_033_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256=MIGRATION_SHA256,
            table_count=59, routine_count=7, trigger_count=11, expected_table_set_verified=True,
            migrator_ownership_verified=True, runtime_dml_grants_absent=True, runtime_function_execute_absent=True,
            predecessor_billing_taxi_fulfillment_contracts_preserved=True, billing_seed_contract_verified=True,
            routine_trigger_contract_readback_verified=True, billing_admin_role_constraint_verified=True,
            billing_admin_role_033_applied=True, role_assignment_dml_executed=False,
            admin_role_row_count_unchanged_under_lock=True, role_values_printed=False,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            taxi_trips_enabled=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))

if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-billing-admin-role"]:
        stop("USE_APPLY_BILLING_ADMIN_ROLE_ONLY")
    os.umask(0o077)
    try:
        apply_billing_admin_role()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATION_033_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
