#!/usr/bin/env python3
"""Read-only reconciliation after an unconfirmed replacement Preview 026-028 attempt."""
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
SOURCE_COMMIT = "72024a1ed0d8bdcc0de799345b501a0e3b153d3a"
HELPER_BLOB = "381b25382ca25506b8e81ddb57e66a6761e2515a"
HELPER_SHA256 = "aef7e9b7cb55194a1f51dd4fc1d55c7315d4c1764384063ef09c80e84e48978f"

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


DETAILS_SQL = """
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT json_build_object(
 'read_only', current_setting('transaction_read_only'),
 'unvalidated_constraint_count', (SELECT count(*) FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND NOT c.convalidated),
 'unvalidated_constraints', COALESCE((SELECT json_agg(x ORDER BY x.table_name,x.constraint_name)
   FROM (SELECT t.relname::text AS table_name,c.conname::text AS constraint_name,c.contype::text AS kind
     FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='public' AND NOT c.convalidated ORDER BY t.relname,c.conname LIMIT 50) x),'[]'::json),
 'product_flags_count', (SELECT count(*) FROM pg_attribute a
    JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='product_listings' AND a.attnum>0 AND NOT a.attisdropped
     AND a.attname IN ('requires_prescription','controlled_item')),
 'user_trigger_count', (SELECT count(*) FROM pg_trigger g
    JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND NOT g.tgisinternal),
 'new_table_names', COALESCE((SELECT json_agg(t.relname::text ORDER BY t.relname)
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
     AND t.relkind IN ('r','p','v','m','S','f') AND t.relname IN
      ('fulfillment_orders','fulfillment_order_items','fulfillment_order_events','fulfillment_order_ratings',
       'fulfillment_order_location_updates','mobility_document_reviews','mobility_document_review_events',
       'platform_notifications')),'[]'::json),
 'driver_document_private_constraint_present', EXISTS(SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='media_assets'
     AND c.conname='media_assets_driver_documents_private_check')
);
ROLLBACK;
"""


def read_details(reader, work, password):
    if not re.fullmatch(r'[0-9a-f]{64}',password):stop('PASSWORD_FORMAT_REJECTED')
    socket_dir=str(work/reader.CONNECTION)
    pgpass=work/'reconciliation.pgpass'
    with pgpass.open('x') as stream:
        os.chmod(pgpass,0o600)
        host=socket_dir.replace('\\','\\\\').replace(':','\\:')
        stream.write(host+':5432:khedmah:khedmah_migrator:'+password+'\n')
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','CSQL_PROXY_','GOOGLE_'))}
    env.update(PGPASSFILE=str(pgpass),PGCONNECT_TIMEOUT='10',PGSSLMODE='disable',
               PGOPTIONS='-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on '
                         '-c statement_timeout=30000 -c lock_timeout=5000')
    try:
        result=subprocess.run(['psql','-X','-w','-q','-A','-t','-h',socket_dir,'-p','5432',
            '-U',reader.USER,'-d',reader.DATABASE,'-v','ON_ERROR_STOP=1','-P','pager=off'],
            input=DETAILS_SQL,text=True,capture_output=True,timeout=60,env=env)
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or len(result.stdout)>32768:stop('FULFILLMENT_DETAIL_READ_FAILED')
    value=json.loads(result.stdout)
    required={'read_only','unvalidated_constraint_count','unvalidated_constraints','product_flags_count',
              'user_trigger_count','new_table_names','driver_document_private_constraint_present'}
    if not isinstance(value,dict) or set(value)!=required or value['read_only']!='on':
        stop('FULFILLMENT_DETAIL_SHAPE_INVALID')
    for key in ('unvalidated_constraint_count','product_flags_count','user_trigger_count'):
        if type(value[key]) is not int or value[key]<0:stop('FULFILLMENT_DETAIL_COUNT_INVALID')
    rows=value['unvalidated_constraints']
    if not isinstance(rows,list) or len(rows)!=min(value['unvalidated_constraint_count'],50):
        stop('FULFILLMENT_DETAIL_CONSTRAINT_INVENTORY_INVALID')
    for row in rows:
        if (not isinstance(row,dict) or set(row)!={'table_name','constraint_name','kind'}
                or not all(isinstance(x,str) and len(x)<=63 for x in row.values())):
            stop('FULFILLMENT_DETAIL_CONSTRAINT_SHAPE_INVALID')
    names=value['new_table_names']
    if not isinstance(names,list) or any(not isinstance(x,str) or len(x)>63 for x in names):
        stop('FULFILLMENT_DETAIL_TABLE_SHAPE_INVALID')
    if type(value['driver_document_private_constraint_present']) is not bool:
        stop('FULFILLMENT_DETAIL_FLAG_INVALID')
    return value


def classify(helper, predecessor, foundation, reader, work, password, sql025, migrations, catalog):
    # Catalog verification reads only; no migration builder or apply entrypoint is called.
    try:
        predecessor.verify_catalog(foundation,catalog,applied=True)
        is_025=True
    except SystemExit:
        is_025=False
    try:
        helper.verify_result(predecessor,foundation,catalog)
        is_028=True
    except SystemExit:
        is_028=False
    if is_025:
        sql=helper.build_preflight_sql(predecessor,foundation,sql025)
        marker='PREVIEW_V2_FULFILLMENT_PREDECESSOR_ACK'
        state='SCHEMA_025_PRESENT_026_028_ABSENT'
    elif is_028:
        sql=helper.build_readback_sql(predecessor,foundation,sql025,migrations)
        marker='PREVIEW_V2_FULFILLMENT_READBACK_ACK'
        state='SCHEMA_026_028_PRESENT_VERIFIED_NO_REPLAY'
    else:
        return 'SCHEMA_PARTIAL_OR_DRIFTED_HOLD'
    # Defense in depth: every executed contract must be a read-only transaction.
    if not sql.startswith('BEGIN READ ONLY;') or '\nCOMMIT;' in sql:
        stop('READ_ONLY_CONTRACT_REQUIRED')
    try:
        helper.execute_sql(reader,work,password,sql,marker)
    except SystemExit:
        return 'SCHEMA_CONTRACT_UNCONFIRMED_HOLD'
    return state


def inspect_fulfillment():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        helper = verified_module(work, 'fulfillment_contract', fetch_blob(HELPER_BLOB), HELPER_SHA256)
        predecessor, foundation, reader, sql025, migrations = helper.load_sources(work)
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
                catalog = reader.read_catalog(work, password)
                details = read_details(reader, work, password)
                state = classify(helper, predecessor, foundation, reader, work, password,
                                 sql025, migrations, catalog)
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_FULFILLMENT_RECONCILIATION_READ_COMPLETED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, schema_state=state,
            table_count=catalog['relation_count'], routine_count=catalog['routine_count'],
            relation_inventory_complete=catalog['relation_inventory_complete'],
            catalog_metadata=details, migration_secret_version="1", secret_payload_access=True,
            credential_values_printed=False, application_data_rows_printed=False,
            schema_mutation=False, runtime_grants_mutation=False, cloud_resource_configuration_mutation=False,
            retry_authorized=False, full_schema_ready=False, application_deployed=False, floot_connected=False,
            prior_attempt_commit_or_rollback_proven=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),sort_keys=True))


if __name__ == "__main__":
    if sys.argv[1:] != ["--inspect"]:
        stop("USE_INSPECT_ONLY")
    os.umask(0o077)
    try:
        inspect_fulfillment()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("FULFILLMENT_RECONCILIATION_READ_UNCONFIRMED_NO_RETRY")
