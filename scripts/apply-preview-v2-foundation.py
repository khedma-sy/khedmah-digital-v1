#!/usr/bin/env python3
"""Apply only the canonical 001-022 foundation to the verified empty Preview."""
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
SOURCE_COMMIT = "e356d576c10a55ae218a6d04c64cb4a81d961768"
READER_BLOB = "1f1565473cc1ab8d8e98791f0fc4af440f9d3d32"
READER_SHA256 = "154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11"
MANIFEST_SHA256 = "a7905bdf45f3abe7b9efb7ea216781877aeaa1a8f8806a88d7fb7933f248442e"
MIGRATIONS = [
  [
    "001_core_identity_accounts.sql",
    "f877e5075c9d86b4ad5b2a54230a89b5b414cab7"
  ],
  [
    "002_create_profiles.sql",
    "7df587161ac1b7142a4ae2f1890d897efb18d1fe"
  ],
  [
    "003_create_professional_profiles.sql",
    "7a5c9ec9c7318c882998c1d54b792c8a7b52edb8"
  ],
  [
    "004_analytics_and_contact.sql",
    "f31362e39c177cd32fd43ac650624cfb837fa84b"
  ],
  [
    "005_email_verifications_and_admin_roles.sql",
    "33453486ebfb1bb917917d663f8e0098d8be0e48"
  ],
  [
    "006_media_assets.sql",
    "6c084d29ce04645b69c28ceaa7fe819d1c0be04a"
  ],
  [
    "007_v2_marketplace.sql",
    "19316dc3d7572db67c9ba832fb3ae65cc7715c6f"
  ],
  [
    "008_provider_service_radius.sql",
    "6442f344cc83e8e11a08af986ae6569f10ac07e1"
  ],
  [
    "009_canonical_identity_runtime.sql",
    "65229f1a3b52488cff23777b445ec8e2c0c02efb"
  ],
  [
    "010_canonical_runtime_domains.sql",
    "8b796bcdfe063d3a1abc1fc6321893d70b44b86b"
  ],
  [
    "011_canonical_media_contract.sql",
    "a8cbcef691c6c8043af1381aff1b8d81e25b6f7f"
  ],
  [
    "012_nearby_preferences.sql",
    "d02f9d3dbf0705ce16a049cd117132f8d7d21a1b"
  ],
  [
    "013_nearby_notifications_read_state.sql",
    "7b40f070fb91609b8dd3ea58b9486af2f9770c5c"
  ],
  [
    "014_supplier_discovery.sql",
    "4f14d13ad0eeedb2842365697909e09d09dc6f59"
  ],
  [
    "015_contact_target_contract.sql",
    "ac7012370f7164cc1d175c7e085f158040e012f4"
  ],
  [
    "016_contact_submission_idempotency.sql",
    "026d3539235332409070624332efd91e2828b74d"
  ],
  [
    "017_category_taxonomy_contract.sql",
    "d50b0b3895325230a84349274ed57a90e307e640"
  ],
  [
    "018_persistent_rate_limit_buckets.sql",
    "1f6b62e4b49b1527cd76e1256aef1e20d6639651"
  ],
  [
    "019_remove_out_of_scope_subscription_schema.sql",
    "f7348162f8990dfd9d727ddffe0524316978acb6"
  ],
  [
    "020_identity_recovery_oauth.sql",
    "797c383beeeaa6f15bb061208788411820987f36"
  ],
  [
    "021_provider_reports.sql",
    "3f7912d2adc007e86fd54215a7013d2706bbbf3f"
  ],
  [
    "022_expand_category_taxonomy.sql",
    "b1cd737a2efab374dbdcef039fe85b796533a69b"
  ]
]
TABLES = [
  "admin_roles",
  "analytics_events",
  "audit_logs",
  "business_branches",
  "business_opening_hours",
  "business_profiles",
  "business_social_links",
  "categories",
  "category_taxonomy_022_before_image",
  "contact_action_events",
  "contact_inquiries",
  "contact_submission_idempotency",
  "core_user_accounts",
  "email_verifications",
  "external_identities",
  "identity_credentials",
  "identity_sessions",
  "locations",
  "media_assets",
  "nearby_notifications",
  "nearby_preferences",
  "organization_members",
  "organizations",
  "password_reset_tokens",
  "permissions",
  "professional_profiles",
  "profiles",
  "provider_reports",
  "rate_limit_buckets",
  "role_permissions",
  "roles",
  "service_listings",
  "supplier_capabilities",
  "trust_history",
  "verification_requests"
]

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


def load_sources(work):
    reader = fetch_blob(READER_BLOB)
    if hashlib.sha256(reader).hexdigest() != READER_SHA256:
        stop("READER_CHECKSUM_MISMATCH")
    chunks = [fetch_blob(sha) for _, sha in MIGRATIONS]
    if hashlib.sha256(b"".join(chunks)).hexdigest() != MANIFEST_SHA256:
        stop("FOUNDATION_MANIFEST_CHECKSUM_MISMATCH")
    path = work / "reader.py"
    path.write_bytes(reader)
    spec = importlib.util.spec_from_file_location("preview_catalog_reader", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, [part.decode("utf-8") for part in chunks]


def validate_baseline(value):
    if (value.get("relation_count") != 0 or value.get("relations") != []
            or value.get("relation_inventory_complete") is not True
            or value.get("routine_count") != 0
            or value.get("schemas") != [{"name": "public", "owner": "pg_database_owner"}]):
        stop("DATABASE_NOT_EMPTY_RECONCILE_NO_REPLAY")
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


def build_sql(chunks):
    if len(chunks) != 22 or hashlib.sha256("".join(chunks).encode()).hexdigest() != MANIFEST_SHA256:
        stop("FOUNDATION_MANIFEST_CHECKSUM_MISMATCH")
    # Same advisory key as the canonical foundation runner; recheck after acquiring it.
    before = """
BEGIN;
SET LOCAL search_path = public, pg_catalog;
DO $guard$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('khedmah-nonproduction-foundation-001-022', 0));
  IF current_database() <> 'khedmah' OR current_user <> 'khedmah_migrator'
     OR session_user <> 'khedmah_migrator'
     OR current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999 THEN
    RAISE EXCEPTION 'FOUNDATION_DATABASE_IDENTITY_MISMATCH';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
             WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
                WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') THEN
    RAISE EXCEPTION 'FOUNDATION_DATABASE_NOT_EMPTY';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')
               AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
     OR pg_catalog.has_database_privilege('khedmah_app',current_database(),'CREATE')
     OR pg_catalog.has_schema_privilege('khedmah_app','public','CREATE') THEN
    RAISE EXCEPTION 'FOUNDATION_ROLE_PRIVILEGES_DRIFT';
  END IF;
END
$guard$;
"""
    expected = "ARRAY[" + ",".join("'" + name + "'" for name in TABLES) + "]::text[]"
    after = """
DO $verify$
DECLARE installed text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname::text) INTO installed
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f');
  IF installed IS DISTINCT FROM EXPECTED_TABLES
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
                  AND (c.relkind <> 'r' OR pg_catalog.pg_get_userbyid(c.relowner) <> 'khedmah_migrator'))
     OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
         AND table_name='categories' AND column_name IN
         ('parent_code','visual_key','search_aliases_ar','search_aliases_en','is_featured')) <> 5 THEN
    RAISE EXCEPTION 'FOUNDATION_POSTCONDITION_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r'
               AND (pg_catalog.has_table_privilege('khedmah_app',c.oid,'SELECT')
                 OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'INSERT')
                 OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'UPDATE')
                 OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'DELETE'))) THEN
    RAISE EXCEPTION 'FOUNDATION_RUNTIME_GRANTS_UNEXPECTED';
  END IF;
END
$verify$;
COMMIT;
SELECT 'PREVIEW_V2_FOUNDATION_COMMIT_ACK';
""".replace("EXPECTED_TABLES", expected)
    return before + "\n".join(chunks) + "\n" + after


def execute_foundation(reader, work, password, chunks):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    sql = build_sql(chunks).replace("BEGIN;\n", "BEGIN READ WRITE;\n", 1)
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "foundation.pgpass"
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
        stop("FOUNDATION_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != "PREVIEW_V2_FOUNDATION_COMMIT_ACK":
        stop("FOUNDATION_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")


def verify_result(value):
    relations = value.get("relations", [])
    if (value.get("relation_count") != len(TABLES)
            or value.get("relation_inventory_complete") is not True
            or sorted(row.get("name", "") for row in relations) != TABLES
            or value.get("routine_count") != 0):
        stop("FOUNDATION_COMMITTED_READBACK_MISMATCH_NO_REPLAY")
    for row in relations:
        if (row.get("schema") != "public" or row.get("kind") != "r"
                or row.get("owner") != "khedmah_migrator"
                or any(row.get("runtime_" + op) is not False for op in ("select", "insert", "update", "delete"))):
            stop("FOUNDATION_COMMITTED_OWNER_OR_GRANTS_MISMATCH_NO_REPLAY")


def apply_foundation():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, chunks = load_sources(work)
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
                baseline = reader.read_catalog(work, password)
                validate_baseline(baseline)
                print(json.dumps(dict(stage="PREVIEW_V2_FOUNDATION_EMPTY_PREFLIGHT_PASSED",
                    project=reader.PROJECT, migration_count=22, manifest_sha256=MANIFEST_SHA256)), flush=True)
                execute_foundation(reader, work, password, chunks)
                print(json.dumps(dict(stage="PREVIEW_V2_FOUNDATION_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(catalog)
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_FOUNDATION_001_022_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, catalog=catalog,
            source_commit=SOURCE_COMMIT, manifest_sha256=MANIFEST_SHA256,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, canonical_taxonomy_seed_applied=True, runtime_grants_mutation=False,
            application_data_rows_printed=False, cloud_resource_configuration_mutation=False,
            full_schema_ready=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-foundation"]:
        stop("USE_APPLY_FOUNDATION_ONLY")
    os.umask(0o077)
    try:
        apply_foundation()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("FOUNDATION_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
