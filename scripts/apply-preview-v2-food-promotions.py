#!/usr/bin/env python3
"""Apply canonical 034 to the held Preview after verified 031/032 and 033."""
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

REPO='khedma-sy/khedmah-digital-v1'
SOURCE_COMMIT='123051755f93efc095320e2f3950ecf3b8070cec'
AUTHORITY_BLOB='54872fe37e59cdf464f8384e9a9fe11c2d24020d'
AUTHORITY_SHA256='f0c5d130d5b3481702ca21fdeabbc7ae1d0257ce76e145cc89be8317a7e50acf'
MIGRATION_NAME='034_food_order_promotions.sql'
MIGRATION_BLOB='b59b8ae42b86bc505d9f2293579546a344e37ab1'
MIGRATION_SHA256='127206eb637c285b5fe8ed7bba389360562288e27cc3379d22596fb7dc2ac2dd'
TABLES=['food_promo_claims','food_promo_codes']


def load_sources(work):
    authority=verified_module(work,'taxi_authority_contract',fetch_blob(AUTHORITY_BLOB),AUTHORITY_SHA256)
    reader,args=authority.load_sources(work)
    sql034=fetch_blob(MIGRATION_BLOB).decode('utf-8')
    verify_sources(authority,args,sql034)
    return reader,authority,args,sql034


def verify_sources(authority,args,sql034):
    authority.verify_sources(*args)
    if hashlib.sha256(sql034.encode()).hexdigest()!=MIGRATION_SHA256:
        stop('MIGRATION_034_CHECKSUM_MISMATCH')


def canonical_body(sql034):
    if hashlib.sha256(sql034.encode()).hexdigest()!=MIGRATION_SHA256:
        stop('MIGRATION_034_CHECKSUM_MISMATCH')
    header,begin,rest=sql034.partition('BEGIN;\n\n')
    body,commit,tail=rest.rpartition('\nCOMMIT;\n')
    if (not begin or not commit or tail or sql034.count('BEGIN;')!=1 or sql034.count('COMMIT;')!=1
            or not body.startswith('CREATE TABLE food_promo_codes (')
            or body.count('ALTER TABLE fulfillment_orders')!=1):
        stop('MIGRATION_034_TRANSACTION_MANIFEST_MISMATCH')
    return body


def verify_result(authority,args,value):
    expected=[('public',name) for name in TABLES]
    new=[row for row in value.get('relations',[]) if (row.get('schema'),row.get('name')) in expected]
    if (value.get('relation_count')!=64 or value.get('routine_count')!=9 or len(new)!=2
            or sorted((row['schema'],row['name']) for row in new)!=expected):
        stop('MIGRATION_034_CATALOG_MISMATCH')
    for row in new:
        if (row.get('kind')!='r' or row.get('owner')!='khedmah_migrator'
                or any(row.get('runtime_'+op) is not False for op in ('select','insert','update','delete'))):
            stop('MIGRATION_034_OWNER_OR_GRANT_DRIFT')
    # The two new rows are verified above; preserve complete 031/032 checks for
    # all remaining public and Taxi objects, roles, identity and inventory length.
    retained=dict(value,relation_count=62,relations=[row for row in value['relations']
                  if (row.get('schema'),row.get('name')) not in expected])
    authority.verify_result(args,retained)


def retained_contract(authority,args):
    baseline=authority.postcondition_sql(args)
    admin,billing,taxi,fulfillment,predecessor,foundation,*sql=args
    names=billing.tables(taxi,fulfillment,predecessor,foundation)
    allowed="nspname NOT IN ('public','information_schema')"
    expanded="nspname NOT IN ('public','khedmah_taxi','information_schema')"
    old=predecessor.catalog_guard(names,'MIGRATIONS_031_032_PUBLIC_POSTCONDITION_FAILED',routine_count=9).replace(allowed,expanded)
    new=predecessor.catalog_guard(sorted(names+TABLES),'MIGRATION_034_PUBLIC_POSTCONDITION_FAILED',routine_count=9).replace(allowed,expanded)
    if not baseline.startswith(old) or baseline.count(old)!=1:
        stop('MIGRATION_034_PREDECESSOR_MANIFEST_MISMATCH')
    # Prior fulfillment check asserts the retained total-constraint name/type,
    # not its expression. This phase separately verifies its old/new definitions.
    return new+baseline[len(old):]


def normalized_definition(expression):
    # Deparser casts numeric zero differently across expressions. Preserve all
    # operators/literals, normalizing only whitespace, parentheses and casts.
    return ("replace(regexp_replace("+expression+
            ",'[[:space:]()]|::text|::numeric','','g'),'''0''','0')")


def total_contract(applied):
    expected='CHECKdelivery_feeISNULLANDtotalISNULLORtotal=subtotal'+('-discount_amount' if applied else '')+'+delivery_fee'
    return """
DO $total034$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.fulfillment_orders'::regclass AND c.conname='fulfillment_orders_total_contract'
        AND c.contype='c' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND NORMALIZED=$expected$EXPECTED$expected$)<>1 THEN
    RAISE EXCEPTION 'MIGRATION_034_TOTAL_CONTRACT_INVALID';
  END IF;
END
$total034$;
""".replace('NORMALIZED',normalized_definition('pg_catalog.pg_get_constraintdef(c.oid)')).replace('EXPECTED',expected)


def absence_contract():
    return """
DO $absence034$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.fulfillment_orders'::regclass
      AND attname IN ('food_promo_id','promo_code','discount_amount'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.fulfillment_orders'::regclass
         AND conname IN ('fulfillment_orders_discount_amount_check','fulfillment_orders_promo_snapshot_check'))
     OR to_regclass('public.food_promo_merchant_created_idx') IS NOT NULL
     OR to_regclass('public.food_promo_active_window_idx') IS NOT NULL
     OR to_regclass('public.food_promo_claim_limit_idx') IS NOT NULL
     OR to_regclass('public.food_promo_claim_user_limit_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_034_PARTIAL_STATE_NO_REPLAY';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fulfillment_orders) THEN
    RAISE EXCEPTION 'MIGRATION_034_EXISTING_ORDERS_REQUIRE_REVIEW';
  END IF;
END
$absence034$;
"""+total_contract(False)


def table_manifest(sql034):
    canonical_body(sql034)
    types={'TEXT':'text','INTEGER':'integer','SMALLINT':'smallint','NUMERIC(14,2)':'numeric(14,2)',
           'BOOLEAN':'boolean','TIMESTAMPTZ':'timestamp with time zone'}
    definitions=re.findall(r'CREATE TABLE (\w+) \((.*?)\n\);',sql034,re.S)
    columns=[];foreign=[];positions={}
    for table,body in definitions:
        rows=re.findall(r'^  (\w+) (NUMERIC\(14,2\)|TEXT|SMALLINT|INTEGER|BOOLEAN|TIMESTAMPTZ)([^\n]*)',body,re.M)
        positions[table]={name:i for i,(name,kind,rest) in enumerate(rows,1)}
        for i,(name,kind,rest) in enumerate(rows,1):
            default=re.search(r"DEFAULT (NOW\(\)|TRUE|0|1|'applied')",rest)
            default=default.group(1).lower().replace('(','').replace(')','') if default else ''
            columns.append((table,name,types[kind],i,'NOT NULL' in rest or 'PRIMARY KEY' in rest,default))
            ref=re.search(r'REFERENCES (\w+)\((\w+)\) ON DELETE RESTRICT',rest)
            if ref:foreign.append((table,i,*ref.groups()))
    columns += [('fulfillment_orders','food_promo_id','text',28,False,''),
                ('fulfillment_orders','promo_code','text',29,False,''),
                ('fulfillment_orders','discount_amount','numeric(14,2)',30,True,'0')]
    foreign += [('fulfillment_orders',28,'food_promo_codes','id')]
    indexes=[]
    for name,table,cols in re.findall(r'CREATE INDEX (\w+)\s+ON (\w+)\(([^)]+)\);',sql034):
        keys=[col.strip().split() for col in cols.split(',')]
        indexes.append((name,table,' '.join(str(positions[table][key[0]]) for key in keys),
                        ' '.join('3' if len(key)>1 and key[1]=='DESC' else '0' for key in keys)))
    if sorted(table for table,body in definitions)!=TABLES or (len(columns),len(foreign),len(indexes))!=(34,7,4):
        stop('MIGRATION_034_SCHEMA_MANIFEST_MISMATCH')
    return columns,foreign,indexes


def checks_manifest():
    codes=["code=uppercodeANDcode~'^[A-Z0-9_-]{4,32}$'",
        'char_lengthbtrimname_ar>=2ANDchar_lengthbtrimname_ar<=100',
        "discount_type=ANYARRAY['percentage','fixed']",'percentage_off>=1ANDpercentage_off<=90',
        'fixed_amount>0',"currency=ANYARRAY['SYP','USD']",'minimum_subtotal>=0','maximum_discount>0',
        'valid_until>valid_from','max_redemptionsISNULLORmax_redemptions>0',
        'per_user_limit>=1ANDper_user_limit<=20','max_redemptionsISNULLORmax_redemptions>=per_user_limit',
        "discount_type='percentage'ANDpercentage_offISNOTNULLANDfixed_amountISNULLORdiscount_type='fixed'ANDpercentage_offISNULLANDfixed_amountISNOTNULLANDfixed_amount<minimum_subtotalANDmaximum_discountISNULL"]
    claims=["code_snapshot=uppercode_snapshotANDcode_snapshot~'^[A-Z0-9_-]{4,32}$'",'subtotal_snapshot>0',
        'discount_amount>0ANDdiscount_amount<subtotal_snapshot',"currency=ANYARRAY['SYP','USD']",
        "status=ANYARRAY['applied','redeemed','released']",
        "status='applied'ANDredeemed_atISNULLANDreleased_atISNULLORstatus='redeemed'ANDredeemed_atISNOTNULLANDreleased_atISNULLORstatus='released'ANDredeemed_atISNULLANDreleased_atISNOTNULL"]
    orders=['discount_amount>=0ANDdiscount_amount<subtotal',
        "food_promo_idISNULLANDpromo_codeISNULLANDdiscount_amount=0ORfood_promo_idISNOTNULLANDpromo_codeISNOTNULLANDdiscount_amount>0ANDpromo_code=upperpromo_codeANDpromo_code~'^[A-Z0-9_-]{4,32}$'"]
    return [(table,'CHECK'+definition) for table,items in
            [('food_promo_codes',codes),('food_promo_claims',claims),('fulfillment_orders',orders)] for definition in items]


def structural_contract(billing,sql034):
    columns,foreign,indexes=table_manifest(sql034)
    keys=[('food_promo_codes','p','1'),('food_promo_codes','u','4 2'),
          ('food_promo_claims','p','1'),('food_promo_claims','u','3')]
    return """
DO $food034$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('food_promo_codes','food_promo_claims') AND a.attnum>0)<>31
     OR (SELECT count(*) FROM pg_catalog.pg_attribute
         WHERE attrelid='public.fulfillment_orders'::regclass AND attnum>0)<>30
     OR (SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN (VALUES COLUMN_VALUES) e(tablename,name,typename,ordinal,required,defaultvalue)
           ON c.relname::text=e.tablename AND a.attname::text=e.name AND a.attnum=e.ordinal
         LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
         WHERE n.nspname='public' AND NOT a.attisdropped AND a.attnotnull=e.required
           AND pg_catalog.format_type(a.atttypid,a.atttypmod)=e.typename AND a.attidentity='' AND a.attgenerated=''
           AND a.atthasdef=(e.defaultvalue<>'')
           AND (e.defaultvalue='' OR DEFAULT_DEFINITION=e.defaultvalue))<>34 THEN
    RAISE EXCEPTION 'MIGRATION_034_COLUMN_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid IN
        ('public.food_promo_codes'::regclass,'public.food_promo_claims'::regclass))<>29
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid IN
        ('public.food_promo_codes'::regclass,'public.food_promo_claims'::regclass,'public.fulfillment_orders'::regclass)
          AND (NOT c.convalidated OR c.condeferrable OR c.condeferred))
     OR EXISTS (SELECT 1 FROM (VALUES CHECK_VALUES) e(tablename,definition)
         WHERE (SELECT count(*) FROM pg_catalog.pg_constraint c
           WHERE c.conrelid=pg_catalog.to_regclass('public.'||e.tablename) AND c.contype='c'
             AND CHECK_DEFINITION=e.definition)<>1)
     OR EXISTS (SELECT 1 FROM (VALUES KEY_VALUES) e(tablename,kind,keypositions)
         WHERE (SELECT count(*) FROM pg_catalog.pg_constraint c
           WHERE c.conrelid=pg_catalog.to_regclass('public.'||e.tablename) AND c.contype::text=e.kind
             AND c.conkey=string_to_array(e.keypositions,' ')::smallint[])<>1)
     OR EXISTS (SELECT 1 FROM (VALUES FOREIGN_VALUES) e(tablename,ordinal,reference,target_column)
         WHERE (SELECT count(*) FROM pg_catalog.pg_constraint c
           JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=c.confkey[1]
           WHERE c.conrelid=pg_catalog.to_regclass('public.'||e.tablename) AND c.contype='f'
             AND c.conkey=ARRAY[e.ordinal]::smallint[] AND cardinality(c.confkey)=1
             AND c.confrelid=pg_catalog.to_regclass('public.'||e.reference) AND a.attname::text=e.target_column
             AND NOT a.attisdropped AND c.confdeltype='r' AND c.confupdtype='a' AND c.confmatchtype='s')<>1) THEN
    RAISE EXCEPTION 'MIGRATION_034_CONSTRAINT_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid IN
        ('public.food_promo_codes'::regclass,'public.food_promo_claims'::regclass))<>8
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index WHERE indrelid IN
        ('public.food_promo_codes'::regclass,'public.food_promo_claims'::regclass)
          AND (NOT indisvalid OR NOT indisready OR indexprs IS NOT NULL OR indpred IS NOT NULL))
     OR (SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid
         JOIN pg_catalog.pg_am a ON a.oid=ix.relam
         JOIN (VALUES INDEX_VALUES) e(name,tablename,keys,options)
           ON ix.relname::text=e.name AND i.indrelid=pg_catalog.to_regclass('public.'||e.tablename)
         WHERE a.amname='btree' AND NOT i.indisunique AND i.indnatts=i.indnkeyatts
           AND i.indkey=e.keys::pg_catalog.int2vector AND i.indoption=e.options::pg_catalog.int2vector)<>4 THEN
    RAISE EXCEPTION 'MIGRATION_034_INDEX_CONTRACT_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.food_promo_codes) OR EXISTS (SELECT 1 FROM public.food_promo_claims)
     OR EXISTS (SELECT 1 FROM public.fulfillment_orders) THEN
    RAISE EXCEPTION 'MIGRATION_034_ORDERS_OR_PROMOTIONS_NOT_EMPTY';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid IN
        ('public.food_promo_codes'::regclass,'public.food_promo_claims'::regclass)
      AND (c.relrowsecurity OR c.relforcerowsecurity
        OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR pg_catalog.has_table_privilege('khedmah_runtime_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
                   WHERE acl.grantee=0))) THEN
    RAISE EXCEPTION 'MIGRATION_034_ACCESS_CONTRACT_FAILED';
  END IF;
END
$food034$;
""".replace('COLUMN_VALUES',billing.sql_values(columns)).replace('FOREIGN_VALUES',billing.sql_values(foreign)).replace(
        'KEY_VALUES',billing.sql_values(keys)).replace('CHECK_VALUES',billing.sql_values(checks_manifest())).replace(
        'INDEX_VALUES',billing.sql_values(indexes)).replace('CHECK_DEFINITION',normalized_definition('pg_catalog.pg_get_constraintdef(c.oid)')).replace(
        'DEFAULT_DEFINITION',normalized_definition('pg_catalog.pg_get_expr(d.adbin,d.adrelid)'))


def postcondition_sql(authority,args,sql034):
    verify_sources(authority,args,sql034)
    return retained_contract(authority,args)+structural_contract(args[1],sql034)+total_contract(True)


def build_preflight_sql(authority,args,sql034):
    verify_sources(authority,args,sql034)
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'+authority.postcondition_sql(args)
            +absence_contract()+"ROLLBACK;\nSELECT 'PREVIEW_V2_FOOD_PROMOTIONS_PREDECESSOR_ACK';\n")


def build_sql(authority,args,sql034):
    verify_sources(authority,args,sql034)
    return ("""BEGIN READ WRITE;
SET LOCAL search_path=public,pg_catalog;
DO $lock034$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khedmah-nonproduction-food-promotions-034',0));
END
$lock034$;
LOCK TABLE public.fulfillment_orders IN ACCESS EXCLUSIVE MODE;
"""+authority.postcondition_sql(args)+absence_contract()+canonical_body(sql034)+'\n'
            +postcondition_sql(authority,args,sql034)+"COMMIT;\nSELECT 'PREVIEW_V2_FOOD_PROMOTIONS_COMMIT_ACK';\n")


def build_readback_sql(authority,args,sql034):
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'+postcondition_sql(authority,args,sql034)
            +"ROLLBACK;\nSELECT 'PREVIEW_V2_FOOD_PROMOTIONS_READBACK_ACK';\n")


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
    pgpass = work / "food-promotions.pgpass"
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
        stop("MIGRATION_034_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != marker:
        stop("MIGRATION_034_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")


def apply_food_promotions():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, authority, args, sql034 = load_sources(work)
        sql = build_sql(authority, args, sql034)
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
                authority.verify_result(args, reader.read_catalog(work, password))
                execute_sql(reader, work, password, build_preflight_sql(authority, args, sql034),
                            "PREVIEW_V2_FOOD_PROMOTIONS_PREDECESSOR_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_FOOD_PROMOTIONS_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=62)), flush=True)
                execute_sql(reader, work, password, sql, "PREVIEW_V2_FOOD_PROMOTIONS_COMMIT_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_FOOD_PROMOTIONS_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(authority, args, catalog)
                execute_sql(reader, work, password, build_readback_sql(authority, args, sql034),
                            "PREVIEW_V2_FOOD_PROMOTIONS_READBACK_ACK")
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_FOOD_PROMOTIONS_034_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256=MIGRATION_SHA256,
            table_count=64, routine_count=9, trigger_count=12, expected_table_set_verified=True,
            migrator_ownership_verified=True, runtime_dml_grants_absent=True,
            runtime_function_execute_absent=True, runtime_taxi_schema_access_absent=True,
            predecessor_billing_admin_taxi_fulfillment_contracts_preserved=True,
            billing_admin_role_033_preserved=True, billing_seed_contract_verified=True,
            hardened_032_resolver_body_and_security_preserved=True,
            food_promotion_contract_verified_before_commit=True,
            fulfillment_total_discount_contract_verified=True,
            promotion_and_order_tables_empty=True, promotion_assignment_dml_executed=False,
            routine_trigger_contract_readback_verified=True,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            taxi_trips_enabled=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))

if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-food-promotions"]:
        stop("USE_APPLY_FOOD_PROMOTIONS_ONLY")
    os.umask(0o077)
    try:
        apply_food_promotions()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATION_034_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
