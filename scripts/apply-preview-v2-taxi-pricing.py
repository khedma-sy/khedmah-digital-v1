#!/usr/bin/env python3
"""Apply canonical 029 once to the fully verified replacement Preview 026-028."""
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
SOURCE_COMMIT = '1201dd2eb70f3b826aae47e1fe067b8ab48c558c'
FULFILLMENT_BLOB = '381b25382ca25506b8e81ddb57e66a6761e2515a'
FULFILLMENT_SHA256 = 'aef7e9b7cb55194a1f51dd4fc1d55c7315d4c1764384063ef09c80e84e48978f'
MIGRATION_NAME = '029_taxi_pricing_revisions.sql'
MIGRATION_BLOB = 'c3b9531cb3ea2031b0eeba4d831b89ab76ea5f9e'
MIGRATION_SHA256 = 'df9a7467f59f00e0167233901e6d7bb1e686994e8f97aec43696d53ac2d7870e'


def load_sources(work):
    fulfillment = verified_module(work, 'fulfillment_contract', fetch_blob(FULFILLMENT_BLOB),
                                  FULFILLMENT_SHA256)
    predecessor, foundation, reader, sql025, migrations = fulfillment.load_sources(work)
    sql029 = fetch_blob(MIGRATION_BLOB).decode('utf-8')
    verify_sources(fulfillment, predecessor, sql025, migrations, sql029)
    return fulfillment, predecessor, foundation, reader, sql025, migrations, sql029


def verify_sources(fulfillment, predecessor, sql025, migrations, sql029):
    fulfillment.verify_sources(predecessor, sql025, migrations)
    if hashlib.sha256(sql029.encode()).hexdigest() != MIGRATION_SHA256:
        stop('MIGRATION_029_CHECKSUM_MISMATCH')


def tables(fulfillment, predecessor, foundation):
    return sorted([*fulfillment.tables(predecessor, foundation, True), 'taxi_pricing_revisions'])


def verify_result(fulfillment, predecessor, foundation, value):
    expected = tables(fulfillment, predecessor, foundation)
    if (value.get('database') != 'khedmah' or value.get('user') != 'khedmah_migrator'
            or value.get('read_only') != 'on'
            or not 160000 <= value.get('server_version_num', 0) < 170000
            or value.get('relation_count') != 49 or value.get('routine_count') != 5
            or value.get('relation_inventory_complete') is not True
            or value.get('schemas') != [{'name':'public','owner':'pg_database_owner'}]
            or sorted(row.get('name','') for row in value.get('relations',[])) != expected):
        stop('MIGRATION_029_CATALOG_MISMATCH_NO_REPLAY')
    for row in value['relations']:
        if (row.get('schema') != 'public' or row.get('kind') != 'r'
                or row.get('owner') != 'khedmah_migrator'
                or any(row.get('runtime_'+op) is not False for op in ('select','insert','update','delete'))):
            stop('MIGRATION_029_OWNER_OR_GRANT_DRIFT_NO_REPLAY')
    predecessor.validate_roles(value)


def absence_contract():
    return """
DO $absence029$
BEGIN
  IF pg_catalog.to_regclass('public.taxi_pricing_revisions') IS NOT NULL
     OR pg_catalog.to_regclass('public.taxi_pricing_revisions_zone_activated_idx') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='reject_taxi_pricing_revision_mutation') THEN
    RAISE EXCEPTION 'MIGRATION_029_PRESENT_OR_PARTIAL_NO_REPLAY';
  END IF;
END
$absence029$;
"""


def structural_contract():
    return """
DO $taxi029$
DECLARE cols text[]; types text[]; counts integer[];
BEGIN
  SELECT array_agg(a.attname::text ORDER BY a.attnum),
         array_agg(pg_catalog.format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum)
    INTO cols,types FROM pg_catalog.pg_attribute a
    WHERE a.attrelid='public.taxi_pricing_revisions'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF cols IS DISTINCT FROM ARRAY['id','zone_code','revision','currency','currency_era',
       'opening_fare_minor','per_km_minor','wait_per_minute_minor','booking_fee_minor','minimum_fare_minor',
       'demand_multiplier_bps','effective_base_minor','effective_per_km_minor','effective_wait_per_minute_minor',
       'max_amount_minor','quote_ttl_ms','reason','created_by','activated_at','created_at']::text[]
     OR types IS DISTINCT FROM ARRAY['text','text','bigint','text','text',
       'bigint','bigint','bigint','bigint','bigint','integer','bigint','bigint','bigint','bigint',
       'integer','text','text','timestamp with time zone','timestamp with time zone']::text[]
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                WHERE a.attrelid='public.taxi_pricing_revisions'::regclass AND a.attnum>0
                  AND (a.attisdropped OR NOT a.attnotnull OR a.attidentity<>'' OR a.attgenerated<>'')) THEN
    RAISE EXCEPTION 'MIGRATION_029_COLUMN_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attrdef d
      WHERE d.adrelid='public.taxi_pricing_revisions'::regclass) <> 6
     OR (SELECT count(*) FROM pg_catalog.pg_attrdef d
         JOIN pg_catalog.pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
         JOIN (VALUES ('currency',$expr$'SYP'::text$expr$),
                      ('currency_era',$expr$'SYP_NEW_2026'::text$expr$),
                      ('booking_fee_minor','0'),('demand_multiplier_bps','10000'),
                      ('activated_at','now()'),('created_at','now()')) e(name,expr)
           ON a.attname::text=e.name AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)=e.expr
         WHERE d.adrelid='public.taxi_pricing_revisions'::regclass) <> 6 THEN
    RAISE EXCEPTION 'MIGRATION_029_DEFAULT_CONTRACT_FAILED';
  END IF;
  SELECT ARRAY[count(*)::integer,count(*) FILTER(WHERE contype='c')::integer,
               count(*) FILTER(WHERE contype='p')::integer,count(*) FILTER(WHERE contype='u')::integer,
               count(*) FILTER(WHERE contype='f')::integer] INTO counts
    FROM pg_catalog.pg_constraint WHERE conrelid='public.taxi_pricing_revisions'::regclass;
  IF counts IS DISTINCT FROM ARRAY[19,16,1,1,1]
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                WHERE conrelid='public.taxi_pricing_revisions'::regclass
                  AND (NOT convalidated OR condeferrable OR condeferred))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                    WHERE conrelid='public.taxi_pricing_revisions'::regclass
                      AND conname='taxi_pricing_revisions_pkey' AND contype='p' AND conkey=ARRAY[1]::smallint[])
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                    WHERE conrelid='public.taxi_pricing_revisions'::regclass
                      AND conname='taxi_pricing_revisions_zone_revision_unique'
                      AND contype='u' AND conkey=ARRAY[2,3]::smallint[])
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=c.confkey[1]
                    WHERE c.conrelid='public.taxi_pricing_revisions'::regclass
                      AND c.contype='f' AND c.conkey=ARRAY[18]::smallint[]
                      AND c.confrelid='public.core_user_accounts'::regclass
                      AND cardinality(c.confkey)=1 AND a.attname='user_identifier'
                      AND c.confdeltype='r' AND c.confupdtype='a' AND c.confmatchtype='s')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                    WHERE conrelid='public.taxi_pricing_revisions'::regclass
                      AND conname='taxi_pricing_revisions_amount_ceiling_check' AND contype='c') THEN
    RAISE EXCEPTION 'MIGRATION_029_CONSTRAINT_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid='public.taxi_pricing_revisions'::regclass) <> 3
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index
                WHERE indrelid='public.taxi_pricing_revisions'::regclass
                  AND (NOT indisvalid OR NOT indisready OR indpred IS NOT NULL OR indexprs IS NOT NULL))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
                    JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
                    JOIN pg_catalog.pg_am am ON am.oid=c.relam
                    WHERE i.indrelid='public.taxi_pricing_revisions'::regclass
                      AND c.relname='taxi_pricing_revisions_zone_activated_idx' AND am.amname='btree'
                      AND NOT i.indisunique AND i.indnkeyatts=3 AND i.indnatts=3
                      AND i.indkey='2 19 3'::pg_catalog.int2vector
                      AND i.indoption='0 3 3'::pg_catalog.int2vector) THEN
    RAISE EXCEPTION 'MIGRATION_029_INDEX_CONTRACT_FAILED';
  END IF;
END
$taxi029$;
"""


def postcondition_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029):
    verify_sources(fulfillment, predecessor, sql025, migrations, sql029)
    return (predecessor.catalog_guard(tables(fulfillment, predecessor, foundation),
             'MIGRATION_029_POSTCONDITION_FAILED', routine_count=5)
            + routine_trigger_contract(predecessor, sql025, migrations[1], sql029)
            + fulfillment.structural_contract() + structural_contract())


def build_preflight_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029):
    verify_sources(fulfillment, predecessor, sql025, migrations, sql029)
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            + fulfillment.postcondition_sql(predecessor, foundation, sql025, migrations) + absence_contract()
            + "ROLLBACK;\nSELECT 'PREVIEW_V2_TAXI_PRICING_PREDECESSOR_ACK';\n")


def build_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029):
    verify_sources(fulfillment, predecessor, sql025, migrations, sql029)
    return ("""BEGIN READ WRITE;
SET LOCAL search_path=public,pg_catalog;
DO $lock029$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('khedmah-nonproduction-taxi-pricing-029',0));
END
$lock029$;
""" + fulfillment.postcondition_sql(predecessor, foundation, sql025, migrations) + absence_contract()
            + sql029 + '\n' + postcondition_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029)
            + "COMMIT;\nSELECT 'PREVIEW_V2_TAXI_PRICING_COMMIT_ACK';\n")


def build_readback_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029):
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            + postcondition_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029)
            + "ROLLBACK;\nSELECT 'PREVIEW_V2_TAXI_PRICING_READBACK_ACK';\n")


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

def routine_trigger_contract(predecessor, sql025, sql027, sql029):
    bodies = re.findall(r'CREATE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;', sql025, re.S)
    bodies += re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\)\s+RETURNS TRIGGER AS \$\$(.*?)\$\$ LANGUAGE plpgsql;', sql027, re.S)
    bodies += re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+AS \$\$(.*?)\$\$;', sql029, re.S)
    names = sorted([*predecessor.FUNCTIONS, 'create_pending_mobility_document_review', 'reject_taxi_pricing_revision_mutation'])
    if sorted(name for name, body in bodies) != names:
        stop('MIGRATION_029_FUNCTION_MANIFEST_MISMATCH')
    functions = ','.join("('"+name+"',$body$"+body+"$body$)" for name,body in bodies)
    trigger_rows = [*predecessor.TRIGGERS,
                   ('media_assets_pending_mobility_document_review','media_assets','create_pending_mobility_document_review',5),
                   ('taxi_pricing_revisions_append_only','taxi_pricing_revisions','reject_taxi_pricing_revision_mutation',27)]
    triggers = ','.join("('%s','%s','%s',%d)" % row for row in trigger_rows)
    return """
DO $routines$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      JOIN (VALUES FUNCTION_VALUES) e(name,body) ON e.name=p.proname::text
      WHERE n.nspname='public' AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype
        AND p.prokind='f' AND l.lanname='plpgsql' AND NOT p.prosecdef
        AND p.provolatile='v' AND p.proconfig IS NULL AND p.prosrc=e.body
        AND pg_catalog.pg_get_userbyid(p.proowner)='khedmah_migrator'
        AND NOT pg_catalog.has_function_privilege('khedmah_app',p.oid,'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('khedmah_runtime_role',p.oid,'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
            COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
            WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) <> 5 THEN
    RAISE EXCEPTION 'MIGRATION_029_ROUTINE_BODY_OWNER_OR_EXECUTE_DRIFT';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal) <> 7
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
         JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
         JOIN (VALUES TRIGGER_VALUES) e(name,tablename,functionname,eventtype)
           ON e.name=t.tgname::text AND e.tablename=c.relname::text
             AND e.functionname=p.proname::text AND e.eventtype=t.tgtype::integer
         WHERE n.nspname='public' AND pn.nspname='public' AND NOT t.tgisinternal
           AND t.tgenabled='O' AND t.tgconstraint=0 AND t.tgnargs=0
           AND t.tgqual IS NULL AND t.tgattr=''::pg_catalog.int2vector) <> 7 THEN
    RAISE EXCEPTION 'MIGRATION_029_TRIGGER_BINDING_OR_STATE_DRIFT';
  END IF;
END
$routines$;
""".replace('FUNCTION_VALUES',functions).replace('TRIGGER_VALUES',triggers)

def execute_sql(reader, work, password, sql, marker):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "taxi-pricing.pgpass"
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
        stop("MIGRATION_029_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != marker:
        stop("MIGRATION_029_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")

def apply_taxi_pricing():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        fulfillment, predecessor, foundation, reader, sql025, migrations, sql029 = load_sources(work)
        sql = build_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029)
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
                fulfillment.verify_result(predecessor, foundation, reader.read_catalog(work, password))
                execute_sql(reader, work, password, build_preflight_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029),
                            "PREVIEW_V2_TAXI_PRICING_PREDECESSOR_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_TAXI_PRICING_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=48)), flush=True)
                execute_sql(reader, work, password, sql, "PREVIEW_V2_TAXI_PRICING_COMMIT_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_TAXI_PRICING_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(fulfillment, predecessor, foundation, catalog)
                execute_sql(reader, work, password, build_readback_sql(fulfillment, predecessor, foundation, sql025, migrations, sql029),
                            "PREVIEW_V2_TAXI_PRICING_READBACK_ACK")
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_TAXI_PRICING_029_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256=MIGRATION_SHA256,
            table_count=49, routine_count=5, trigger_count=7, expected_table_set_verified=True,
            migrator_ownership_verified=True, runtime_dml_grants_absent=True,
            runtime_function_execute_absent=True, taxi_pricing_contract_verified_before_commit=True,
            predecessor_fulfillment_contract_preserved=True, routine_trigger_contract_readback_verified=True,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            taxi_trips_enabled=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))

if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-taxi-pricing"]:
        stop("USE_APPLY_TAXI_PRICING_ONLY")
    os.umask(0o077)
    try:
        apply_taxi_pricing()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATION_029_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
