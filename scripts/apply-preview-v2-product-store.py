#!/usr/bin/env python3
"""Apply only pinned canonical migration 024 after verified Preview foundation."""
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

REPO = "khedma-sy/khedmah-digital-v1"
SOURCE_COMMIT = "63a33fbb3938b9ee39254cbaff9d2c354c468dfe"
FOUNDATION_BLOB = "ca8fd53e3abd115575969a348cf16cae8cd303b3"
FOUNDATION_SHA256 = "22bcc84c0b2df468c28c25caa9774052dc95dc6e3b6f81e64bde8fd8e187f52e"
READER_BLOB = "1f1565473cc1ab8d8e98791f0fc4af440f9d3d32"
READER_SHA256 = "154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11"
MIGRATION_BLOB = "c4429a1b95e7a469a85f0dbf3e158608e46c63fd"
MIGRATION_SHA256 = "d2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6"

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


def load_sources(work):
    foundation_bytes = fetch_blob(FOUNDATION_BLOB)
    reader_bytes = fetch_blob(READER_BLOB)
    migration_bytes = fetch_blob(MIGRATION_BLOB)
    if hashlib.sha256(migration_bytes).hexdigest() != MIGRATION_SHA256:
        stop("MIGRATION_024_CHECKSUM_MISMATCH")
    # Import exact reviewed helpers for catalog guards only; never call their apply entrypoints.
    foundation = verified_module(work, "foundation_contract", foundation_bytes, FOUNDATION_SHA256)
    reader = verified_module(work, "catalog_reader", reader_bytes, READER_SHA256)
    return foundation, reader, migration_bytes.decode("utf-8")


def validate_roles(value):
    roles = {r["name"]: r for r in value["roles"]}
    for name in ("khedmah_app", "khedmah_migrator", "khedmah_runtime_role", "khedmah_migration_role"):
        row = roles.get(name, {})
        expected = dict(name=name, login=name in ("khedmah_app", "khedmah_migrator"),
                        super=False, createdb=False, createrole=False, replication=False, bypassrls=False)
        if row != expected:
            stop("DATABASE_ROLE_FLAGS_DRIFT")
    memberships = sorted(value["memberships"], key=lambda r: r["member"])
    if memberships != [
        dict(admin=False, inherit=True, member="khedmah_app", role="khedmah_runtime_role", set=True),
        dict(admin=False, inherit=True, member="khedmah_migrator", role="khedmah_migration_role", set=True)]:
        stop("DATABASE_MEMBERSHIPS_DRIFT")
    privileges = sorted(value["database_privileges"], key=lambda r: r["role"])
    if privileges != [
        dict(connect=True, create=False, public_create=False, public_usage=True, role="khedmah_app", temp=False),
        dict(connect=True, create=True, public_create=True, public_usage=True, role="khedmah_migrator", temp=False)]:
        stop("DATABASE_PRIVILEGES_DRIFT")



def validate_predecessor(foundation, value):
    # Requires a fresh, complete 35-table catalog, independent of pasted owner output.
    foundation.verify_result(value)
    validate_roles(value)
    if value.get("schemas") != [{"name": "public", "owner": "pg_database_owner"}]:
        stop("MIGRATION_024_SCHEMA_SCOPE_DRIFT")


def catalog_guard(tables, label):
    names = "ARRAY[" + ",".join("'" + name + "'" for name in sorted(tables)) + "]::text[]"
    return """
DO $catalog$
DECLARE installed text[];
BEGIN
  IF current_database() <> 'khedmah' OR current_user <> 'khedmah_migrator'
     OR session_user <> 'khedmah_migrator'
     OR current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999 THEN
    RAISE EXCEPTION 'MIGRATION_024_IDENTITY_MISMATCH';
  END IF;
  SELECT array_agg(c.relname::text ORDER BY c.relname::text) INTO installed
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f');
  IF installed IS DISTINCT FROM EXPECTED_TABLES
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
                WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
                  AND (c.relkind <> 'r' OR pg_catalog.pg_get_userbyid(c.relowner) <> 'khedmah_migrator'
                    OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'SELECT')
                    OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'INSERT')
                    OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'UPDATE')
                    OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'DELETE'))) THEN
    RAISE EXCEPTION 'GUARD_LABEL';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')
               AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
     OR pg_catalog.has_database_privilege('khedmah_app',current_database(),'CREATE')
     OR pg_catalog.has_schema_privilege('khedmah_app','public','CREATE') THEN
    RAISE EXCEPTION 'MIGRATION_024_ROLE_PRIVILEGES_DRIFT';
  END IF;
END
$catalog$;
""".replace("EXPECTED_TABLES", names).replace("GUARD_LABEL", label)


def build_sql(foundation, migration):
    if hashlib.sha256(migration.encode()).hexdigest() != MIGRATION_SHA256:
        stop("MIGRATION_024_CHECKSUM_MISMATCH")
    before = """
BEGIN READ WRITE;
SET LOCAL search_path = public, pg_catalog;
DO $lock$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('khedmah-nonproduction-product-store-024', 0));
END
$lock$;
"""
    before += catalog_guard(foundation.TABLES, "MIGRATION_024_PREDECESSOR_DRIFT_NO_REPLAY")
    before += """
DO $before$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='categories' AND column_name IN
      ('parent_code','visual_key','search_aliases_ar','search_aliases_en','is_featured')) <> 5
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname='public' AND t.relname='media_assets' AND c.convalidated
           AND c.conname IN ('media_assets_owner_type_check','media_assets_asset_type_check')) <> 2
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
                JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
                WHERE n.nspname='public' AND t.relname='media_assets'
                  AND c.conname IN ('media_assets_owner_type_check','media_assets_asset_type_check')
                  AND (pg_catalog.pg_get_constraintdef(c.oid) LIKE '%product_listing%'
                    OR pg_catalog.pg_get_constraintdef(c.oid) LIKE '%product_image%')) THEN
    RAISE EXCEPTION 'MIGRATION_024_PARTIAL_OR_PREDECESSOR_INVALID';
  END IF;
END
$before$;
"""
    after = catalog_guard([*foundation.TABLES, "product_listings"], "MIGRATION_024_POSTCONDITION_FAILED")
    after += """
DO $after$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='product_listings' AND column_name IN
      ('business_profile_id','owner_user_id','title_ar','price','currency','category_code',
       'availability','status','moderation_status')) <> 9
     OR (SELECT count(*) FROM pg_catalog.pg_indexes WHERE schemaname='public'
         AND tablename='product_listings' AND indexname IN
         ('product_listings_owner_created_idx','product_listings_business_created_idx',
          'product_listings_public_idx')) <> 3
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname='public' AND t.relname='media_assets' AND c.convalidated
           AND ((c.conname='media_assets_owner_type_check'
                 AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%product_listing%')
             OR (c.conname='media_assets_asset_type_check'
                 AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%product_image%'))) <> 2 THEN
    RAISE EXCEPTION 'MIGRATION_024_PRODUCT_OR_MEDIA_CONTRACT_FAILED';
  END IF;
END
$after$;
COMMIT;
SELECT 'PREVIEW_V2_PRODUCT_STORE_COMMIT_ACK';
"""
    return before + migration + "\n" + after


def execute_migration(reader, work, password, sql):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "product-store.pgpass"
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
        stop("MIGRATION_024_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != "PREVIEW_V2_PRODUCT_STORE_COMMIT_ACK":
        stop("MIGRATION_024_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")



def verify_result(foundation, value):
    expected = sorted([*foundation.TABLES, "product_listings"])
    if (value.get("relation_count") != 36 or value.get("relation_inventory_complete") is not True
            or value.get("routine_count") != 0
            or sorted(row.get("name", "") for row in value.get("relations", [])) != expected):
        stop("MIGRATION_024_COMMITTED_CATALOG_MISMATCH_NO_REPLAY")
    for row in value["relations"]:
        if (row.get("schema") != "public" or row.get("kind") != "r"
                or row.get("owner") != "khedmah_migrator"
                or any(row.get("runtime_" + op) is not False for op in ("select","insert","update","delete"))):
            stop("MIGRATION_024_COMMITTED_OWNER_OR_GRANT_DRIFT_NO_REPLAY")
    validate_roles(value)


def apply_product_store():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        foundation, reader, migration = load_sources(work)
        sql = build_sql(foundation, migration)
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
                validate_predecessor(foundation, reader.read_catalog(work, password))
                print(json.dumps(dict(stage="PREVIEW_V2_PRODUCT_STORE_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=35)), flush=True)
                execute_migration(reader, work, password, sql)
                print(json.dumps(dict(stage="PREVIEW_V2_PRODUCT_STORE_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(foundation, catalog)
        finally:
            reader.stop_proxy(proxy)
        # Compact selected metadata avoids another very long pasted catalog line.
        print(json.dumps(dict(stage="PREVIEW_V2_PRODUCT_STORE_024_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256=MIGRATION_SHA256,
            table_count=36, expected_table_set_verified=True, migrator_ownership_verified=True,
            runtime_dml_grants_absent=True, product_and_media_contract_verified_before_commit=True,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-product-store"]:
        stop("USE_APPLY_PRODUCT_STORE_ONLY")
    os.umask(0o077)
    try:
        apply_product_store()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATION_024_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
