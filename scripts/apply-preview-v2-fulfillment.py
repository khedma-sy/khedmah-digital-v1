#!/usr/bin/env python3
"""Apply only canonical 026-028 after fully verified replacement Preview 025."""
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
SOURCE_COMMIT = "ce88601197329507dfd9565ac6d36f3e73f7928c"
PREDECESSOR_BLOB = "9cdf28e8fc45846e7b012ec7be9844a359d304e9"
PREDECESSOR_SHA256 = "c950c014af500d2500c2e9762e869771fb9281c24b5d63fb1dd284c2db2254d0"
MIGRATIONS = [
    ("026_cash_fulfillment_orders.sql", "751262c11264815488136847e39e3dc162feab85",
     "017a99c2308b6756613bb2636075de81a73c078c3b99f779962b65a90b4dc44b"),
    ("027_mobility_document_reviews.sql", "af18327bf03735f6ceaba5f5a60ab973822db355",
     "c7b1b38455148f8f363fc378b8e6978fb3e696022d77588c0c23d909a726d786"),
    ("028_platform_notifications.sql", "a4dc42dac87226a3628d282d027164e33212c493",
     "806683bdd8b6eb39da0779ab684f079aadd5c1ff3b1b28ffa77860c18a683607"),
]
NEW_TABLES = ['fulfillment_orders','fulfillment_order_items','fulfillment_order_events',
              'fulfillment_order_ratings','fulfillment_order_location_updates',
              'mobility_document_reviews','mobility_document_review_events','platform_notifications']

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
    predecessor = verified_module(work, 'classifieds_contract', fetch_blob(PREDECESSOR_BLOB),
                                  PREDECESSOR_SHA256)
    # Load immutable verification dependencies only; no earlier apply entrypoint is called.
    foundation, reader, sql025 = predecessor.load_sources(work)
    migrations = [fetch_blob(blob).decode('utf-8') for name, blob, sha in MIGRATIONS]
    verify_sources(predecessor, sql025, migrations)
    return predecessor, foundation, reader, sql025, migrations


def verify_sources(predecessor, sql025, migrations):
    if hashlib.sha256(sql025.encode()).hexdigest() != predecessor.MIGRATION_SHA256:
        stop('PREDECESSOR_SQL_CHECKSUM_MISMATCH')
    if len(migrations) != 3 or any(hashlib.sha256(sql.encode()).hexdigest() != entry[2]
                                 for sql, entry in zip(migrations, MIGRATIONS)):
        stop('MIGRATIONS_026_028_CHECKSUM_MISMATCH')


def tables(predecessor, foundation, applied):
    return sorted([*foundation.TABLES, 'product_listings', *predecessor.AD_TABLES,
                   *(NEW_TABLES if applied else [])])


def verify_result(predecessor, foundation, value):
    expected = tables(predecessor, foundation, True)
    if (value.get('database') != 'khedmah' or value.get('user') != 'khedmah_migrator'
            or value.get('read_only') != 'on'
            or not 160000 <= value.get('server_version_num', 0) < 170000
            or value.get('relation_count') != 48 or value.get('routine_count') != 4
            or value.get('relation_inventory_complete') is not True
            or value.get('schemas') != [{'name':'public','owner':'pg_database_owner'}]
            or sorted(row.get('name','') for row in value.get('relations',[])) != expected):
        stop('MIGRATIONS_026_028_CATALOG_MISMATCH_NO_REPLAY')
    for row in value['relations']:
        if (row.get('schema') != 'public' or row.get('kind') != 'r'
                or row.get('owner') != 'khedmah_migrator'
                or any(row.get('runtime_'+op) is not False for op in ('select','insert','update','delete'))):
            stop('MIGRATIONS_026_028_OWNER_OR_GRANT_DRIFT_NO_REPLAY')
    predecessor.validate_roles(value)


def absence_contract():
    return """
DO $absence$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='product_listings' AND column_name IN ('requires_prescription','controlled_item'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                WHERE c.conrelid='public.media_assets'::regclass
                 AND (c.conname='media_assets_driver_documents_private_check'
                   OR (c.conname='media_assets_asset_type_check'
                    AND (pg_catalog.pg_get_constraintdef(c.oid) LIKE '%driver_photo%'
                      OR pg_catalog.pg_get_constraintdef(c.oid) LIKE '%identity_card%'
                      OR pg_catalog.pg_get_constraintdef(c.oid) LIKE '%driving_license%'
                      OR pg_catalog.pg_get_constraintdef(c.oid) LIKE '%vehicle_license%')))) THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_PARTIAL_STATE_NO_REPLAY';
  END IF;
  -- The canonical 027 contains a backfill. Require no eligible existing documents.
  -- Its write transaction locks media_assets before this check through COMMIT.
  IF EXISTS (SELECT 1 FROM public.media_assets WHERE owner_type='business_profile'
             AND visibility='private'
             AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')) THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_EXISTING_DOCUMENTS_REQUIRE_REVIEW';
  END IF;
END
$absence$;
"""


def build_preflight_sql(predecessor, foundation, sql025):
    return ("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n"
            + predecessor.postcondition_sql(foundation, sql025) + absence_contract()
            + "ROLLBACK;\nSELECT 'PREVIEW_V2_FULFILLMENT_PREDECESSOR_ACK';\n")


def routine_trigger_contract(predecessor, sql025, sql027):
    bodies = re.findall(r'CREATE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;', sql025, re.S)
    bodies += re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\)\s+RETURNS TRIGGER AS \$\$(.*?)\$\$ LANGUAGE plpgsql;', sql027, re.S)
    names = sorted([*predecessor.FUNCTIONS, 'create_pending_mobility_document_review'])
    if sorted(name for name, body in bodies) != names:
        stop('MIGRATIONS_026_028_FUNCTION_MANIFEST_MISMATCH')
    functions = ','.join("('"+name+"',$body$"+body+"$body$)" for name,body in bodies)
    trigger_rows = [*predecessor.TRIGGERS,
                   ('media_assets_pending_mobility_document_review','media_assets','create_pending_mobility_document_review',5)]
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
            WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) <> 4 THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_ROUTINE_BODY_OWNER_OR_EXECUTE_DRIFT';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal) <> 6
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
           AND t.tgqual IS NULL AND t.tgattr=''::pg_catalog.int2vector) <> 6 THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_TRIGGER_BINDING_OR_STATE_DRIFT';
  END IF;
END
$routines$;
""".replace('FUNCTION_VALUES',functions).replace('TRIGGER_VALUES',triggers)


def structural_contract():
    return """
DO $structure$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='product_listings' AND column_name IN ('requires_prescription','controlled_item')
      AND data_type='boolean' AND is_nullable='NO' AND column_default='false') <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
         WHERE a.attrelid='public.fulfillment_order_items'::regclass AND a.attname='line_total'
           AND a.attgenerated='s' AND NOT a.attisdropped
           AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) LIKE '%unit_price%'
           AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) LIKE '%quantity%') THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_COLUMN_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid
      JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN (VALUES ('fulfillment_orders_customer_created_idx','fulfillment_orders'),
         ('fulfillment_orders_merchant_status_idx','fulfillment_orders'),
         ('fulfillment_orders_courier_status_idx','fulfillment_orders'),
         ('fulfillment_order_events_order_time_idx','fulfillment_order_events'),
         ('fulfillment_order_ratings_target_idx','fulfillment_order_ratings'),
         ('mobility_document_reviews_business_idx','mobility_document_reviews'),
         ('mobility_document_review_events_business_idx','mobility_document_review_events'),
         ('platform_notifications_user_created_idx','platform_notifications'),
         ('platform_notifications_user_unread_idx','platform_notifications'),
         ('ad_listings_owner_created_idx','ad_listings'),('ad_listings_public_idx','ad_listings'),
         ('ad_listings_pending_idx','ad_listings'),('ad_free_slots_owner_idx','ad_free_slots')) e(name,tablename)
        ON e.name=ix.relname::text AND e.tablename=c.relname::text
      WHERE n.nspname='public' AND i.indisvalid AND i.indisready AND NOT i.indisunique) <> 13 THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_INDEX_CONTRACT_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
             JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
             JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
             WHERE n.nspname='public' AND NOT c.convalidated)
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
         JOIN (VALUES ('fulfillment_orders_coordinates_pair','fulfillment_orders','c'),
          ('fulfillment_orders_total_contract','fulfillment_orders','c'),
          ('fulfillment_orders_customer_idempotency_unique','fulfillment_orders','u'),
          ('fulfillment_order_items_product_unique','fulfillment_order_items','u'),
          ('fulfillment_order_ratings_target_unique','fulfillment_order_ratings','u'),
          ('fulfillment_order_location_order_unique','fulfillment_order_location_updates','u'),
          ('mobility_document_review_decision_check','mobility_document_reviews','c'),
          ('platform_notifications_user_event_unique','platform_notifications','u'),
          ('platform_notifications_event_type_check','platform_notifications','c'),
          ('platform_notifications_reference_type_check','platform_notifications','c'),
          ('platform_notifications_metadata_object_check','platform_notifications','c'),
          ('ad_listing_identity_owner_unique','ad_listings','u'),('ad_price_contract','ad_listings','c'),
          ('ad_contact_contract','ad_listings','c'),('ad_rejection_reason_contract','ad_listings','c'),
          ('ad_free_slot_owner_fk','ad_free_slots','f'),
          ('ad_moderation_reason_contract','ad_moderation_events','c'),
          ('ad_moderation_revision_unique','ad_moderation_events','u')) e(name,tablename,kind)
           ON e.name=c.conname::text AND e.tablename=t.relname::text AND e.kind=c.contype::text
         WHERE n.nspname='public' AND c.convalidated) <> 18 THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_CONSTRAINT_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.media_assets'::regclass AND c.convalidated AND c.contype='c'
       AND ((c.conname='media_assets_owner_type_check'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%ad_listing%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%product_listing%')
         OR (c.conname='media_assets_asset_type_check'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%ad_image%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%product_image%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%driver_photo%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%identity_card%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%driving_license%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%vehicle_license%')
         OR (c.conname='media_assets_driver_documents_private_check'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%business_profile%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%private%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%driver_photo%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%identity_card%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%driving_license%'
             AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%vehicle_license%'))) <> 3 THEN
    RAISE EXCEPTION 'MIGRATIONS_026_028_MEDIA_PRIVACY_OR_CLASSIFIEDS_CONTRACT_FAILED';
  END IF;
END
$structure$;
"""


def postcondition_sql(predecessor, foundation, sql025, migrations):
    verify_sources(predecessor, sql025, migrations)
    return (predecessor.catalog_guard(tables(predecessor, foundation, True),
             'MIGRATIONS_026_028_POSTCONDITION_FAILED', routine_count=4)
            + routine_trigger_contract(predecessor, sql025, migrations[1]) + structural_contract())


def build_sql(predecessor, foundation, sql025, migrations):
    verify_sources(predecessor, sql025, migrations)
    before = """
BEGIN READ WRITE;
SET LOCAL search_path=public,pg_catalog;
DO $lock$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('khedmah-nonproduction-fulfillment-026-028',0));
END
$lock$;
LOCK TABLE public.media_assets IN SHARE ROW EXCLUSIVE MODE;
"""
    return (before + predecessor.postcondition_sql(foundation, sql025) + absence_contract()
            + '\n'.join(migrations) + '\n'
            + postcondition_sql(predecessor, foundation, sql025, migrations)
            + "COMMIT;\nSELECT 'PREVIEW_V2_FULFILLMENT_COMMIT_ACK';\n")


def build_readback_sql(predecessor, foundation, sql025, migrations):
    return ("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n"
            + postcondition_sql(predecessor, foundation, sql025, migrations)
            + "ROLLBACK;\nSELECT 'PREVIEW_V2_FULFILLMENT_READBACK_ACK';\n")


def execute_sql(reader, work, password, sql, marker):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "fulfillment.pgpass"
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
        stop("MIGRATIONS_026_028_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != marker:
        stop("MIGRATIONS_026_028_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")



def apply_fulfillment():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        predecessor, foundation, reader, sql025, migrations = load_sources(work)
        sql = build_sql(predecessor, foundation, sql025, migrations)
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
                predecessor.verify_catalog(foundation, reader.read_catalog(work, password), applied=True)
                execute_sql(reader, work, password, build_preflight_sql(predecessor, foundation, sql025),
                            "PREVIEW_V2_FULFILLMENT_PREDECESSOR_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_FULFILLMENT_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=40)), flush=True)
                execute_sql(reader, work, password, sql, "PREVIEW_V2_FULFILLMENT_COMMIT_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_FULFILLMENT_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(predecessor, foundation, catalog)
                execute_sql(reader, work, password, build_readback_sql(predecessor, foundation, sql025, migrations),
                            "PREVIEW_V2_FULFILLMENT_READBACK_ACK")
        finally:
            reader.stop_proxy(proxy)
        # Compact selected metadata avoids another very long pasted catalog line.
        print(json.dumps(dict(stage="PREVIEW_V2_FULFILLMENT_026_028_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256={name: sha for name, blob, sha in MIGRATIONS},
            table_count=48, routine_count=4, trigger_count=6, expected_table_set_verified=True, migrator_ownership_verified=True,
            runtime_dml_grants_absent=True, runtime_function_execute_absent=True,
            fulfillment_and_media_contract_verified_before_commit=True,
            predecessor_classifieds_contract_preserved=True, preexisting_driver_documents_absent=True,
            routine_trigger_contract_readback_verified=True,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-fulfillment"]:
        stop("USE_APPLY_FULFILLMENT_ONLY")
    os.umask(0o077)
    try:
        apply_fulfillment()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATIONS_026_028_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
