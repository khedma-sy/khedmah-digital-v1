#!/usr/bin/env python3
"""Apply canonical Billing 030 once; keep 033 and deployment as later steps."""
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
SOURCE_COMMIT = '919d9467e99eda66e2495cb2d2de9bb78c28f0f6'
TAXI_BLOB = '4c8738f156b9beb97c98a32acba4945fb340e7f3'
TAXI_SHA256 = '16bf12247d1d2dee3120c1ff9dfdaebb589636cf1e47fc97d6f613b647ebdd75'
MIGRATION_NAME = '030_billing_credits_subscriptions.sql'
MIGRATION_BLOB = '88795ee75d9948e5ecf85d8c2d53f6b77397b52b'
MIGRATION_SHA256 = 'd758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194'
BILLING_TABLES = ['billing_program_config','billing_plans','billing_promo_codes','billing_purchase_orders',
                  'billing_subscriptions','billing_credit_grants','billing_credit_ledger','billing_usage_rates',
                  'billing_usage_receipts','billing_promo_redemptions']


def load_sources(work):
    taxi = verified_module(work, 'taxi_contract', fetch_blob(TAXI_BLOB), TAXI_SHA256)
    fulfillment, predecessor, foundation, reader, sql025, migrations, sql029 = taxi.load_sources(work)
    sql030 = fetch_blob(MIGRATION_BLOB).decode('utf-8')
    verify_sources(taxi, fulfillment, predecessor, sql025, migrations, sql029, sql030)
    return taxi, fulfillment, predecessor, foundation, reader, sql025, migrations, sql029, sql030


def verify_sources(taxi, fulfillment, predecessor, sql025, migrations, sql029, sql030):
    taxi.verify_sources(fulfillment, predecessor, sql025, migrations, sql029)
    verify_migration(sql030)


def verify_migration(sql030):
    if hashlib.sha256(sql030.encode()).hexdigest() != MIGRATION_SHA256:
        stop('MIGRATION_030_CHECKSUM_MISMATCH')


def tables(taxi, fulfillment, predecessor, foundation):
    return sorted([*taxi.tables(fulfillment, predecessor, foundation), *BILLING_TABLES])


def admin_role_predecessor_contract():
    # 033 is a separate owner operation; preserve the canonical three-value check.
    return """
DO $admin030$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_constraint c
      CROSS JOIN LATERAL (SELECT pg_catalog.pg_get_constraintdef(c.oid) AS definition) d
      WHERE c.conrelid='public.admin_roles'::regclass AND c.conname='admin_roles_role_check'
        AND c.contype='c' AND c.convalidated AND NOT c.condeferrable
        AND d.definition LIKE '%bootstrap_admin%' AND d.definition LIKE '%platform_admin%'
        AND d.definition LIKE '%moderator%' AND d.definition NOT LIKE '%billing_admin%'
        AND (length(d.definition)-length(replace(d.definition,'''','')))/2=3) <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_030_ADMIN_ROLE_PREDECESSOR_DRIFT';
  END IF;
END
$admin030$;
"""


def absence_contract():
    return """
DO $absence030$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND substr(c.relname::text,1,8)='billing_')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname IN
                  ('reject_billing_ledger_mutation','grant_welcome_credit_on_login')) THEN
    RAISE EXCEPTION 'MIGRATION_030_PRESENT_OR_PARTIAL_NO_REPLAY';
  END IF;
END
$absence030$;
"""


def schema_manifest(sql030):
    """Extract the small, checksum-fixed canonical DDL; never accept arbitrary SQL."""
    verify_migration(sql030)
    types = {'TEXT':'text','BIGINT':'bigint','INTEGER':'integer','BOOLEAN':'boolean',
             'TIMESTAMPTZ':'timestamp with time zone','JSONB':'jsonb'}
    definitions=re.findall(r'CREATE TABLE (\w+) \((.*?)\n\);',sql030,re.S)
    if sorted(name for name,body in definitions) != sorted(BILLING_TABLES):
        stop('MIGRATION_030_TABLE_MANIFEST_MISMATCH')
    columns=[];constraints=[];positions={}
    for table,body in definitions:
        rows=re.findall(r'^  (\w+) (TEXT|BIGINT|INTEGER|BOOLEAN|TIMESTAMPTZ|JSONB)\b([^\n]*)',body,re.M)
        positions[table]={name:i for i,(name,kind,rest) in enumerate(rows,1)}
        columns.extend((table,name,types[kind],i,'NOT NULL' in rest or 'PRIMARY KEY' in rest,
                        'DEFAULT ' in rest) for i,(name,kind,rest) in enumerate(rows,1))
        counts=[len(re.findall(pattern,body)) for pattern in
                (r'\bCHECK\s*\(',r'\bPRIMARY KEY\b',r'\bUNIQUE\b',r'\bREFERENCES\b')]
        constraints.append((table,*counts))
    indexes=[]
    for unique,name,table,cols,predicate in re.findall(
            r'CREATE (UNIQUE )?INDEX (\w+) ON (\w+)\(([^)]+)\)(?: WHERE ([^;]+))?;',sql030):
        keys=[col.strip().split() for col in cols.split(',')]
        indexes.append((name,table,bool(unique),' '.join(str(positions[table][key[0]]) for key in keys),
                        ' '.join('3' if len(key)>1 and key[1]=='DESC' else '0' for key in keys),
                        re.sub(r'\s','',predicate)))
    if len(indexes)!=7 or len(columns)!=87:
        stop('MIGRATION_030_COLUMN_OR_INDEX_MANIFEST_MISMATCH')
    return columns,constraints,indexes


def sql_values(rows):
    def literal(value):
        if isinstance(value,bool):return 'true' if value else 'false'
        if isinstance(value,int):return str(value)
        return "'"+value.replace("'","''")+"'"
    return ','.join('('+','.join(map(literal,row))+')' for row in rows)


def structural_contract(sql030):
    columns,constraints,indexes=schema_manifest(sql030)
    table_names=','.join("'"+name+"'" for name in BILLING_TABLES)
    index_totals=[(name,pk+uq+sum(ix[1]==name for ix in indexes)) for name,ck,pk,uq,fk in constraints]
    return """
DO $billing030$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN (TABLE_NAMES) AND a.attnum>0) <> COLUMN_COUNT
     OR (SELECT count(*) FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN (VALUES COLUMN_VALUES) e(tablename,name,typename,ordinal_position,required,hasdefault)
           ON c.relname::text=e.tablename AND a.attname::text=e.name AND a.attnum=e.ordinal_position
         WHERE n.nspname='public' AND NOT a.attisdropped AND a.attnotnull=e.required
           AND pg_catalog.format_type(a.atttypid,a.atttypmod)=e.typename
           AND a.attidentity='' AND a.attgenerated='' AND a.atthasdef=e.hasdefault) <> COLUMN_COUNT THEN
    RAISE EXCEPTION 'MIGRATION_030_COLUMN_CONTRACT_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES CONSTRAINT_VALUES) e(tablename,checks,pkeys,uniques,fkeys)
      CROSS JOIN LATERAL (SELECT count(*) AS total,
          count(*) FILTER(WHERE contype='c') AS checks,count(*) FILTER(WHERE contype='p') AS pkeys,
          count(*) FILTER(WHERE contype='u') AS uniques,count(*) FILTER(WHERE contype='f') AS fkeys
        FROM pg_catalog.pg_constraint WHERE conrelid=pg_catalog.to_regclass('public.'||e.tablename)) a
      WHERE (a.total,a.checks,a.pkeys,a.uniques,a.fkeys) IS DISTINCT FROM
            (e.checks+e.pkeys+e.uniques+e.fkeys,e.checks,e.pkeys,e.uniques,e.fkeys))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint x
         JOIN pg_catalog.pg_class c ON c.oid=x.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname IN (TABLE_NAMES)
           AND (NOT x.convalidated OR x.condeferrable OR x.condeferred)) THEN
    RAISE EXCEPTION 'MIGRATION_030_CONSTRAINT_CONTRACT_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES INDEX_TOTALS) e(tablename,expected)
       WHERE (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid=pg_catalog.to_regclass('public.'||e.tablename))<>e.expected)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname IN (TABLE_NAMES)
           AND (NOT i.indisvalid OR NOT i.indisready OR i.indexprs IS NOT NULL))
     OR (SELECT count(*) FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid JOIN pg_catalog.pg_am am ON am.oid=ix.relam
         JOIN (VALUES INDEX_VALUES) e(name,tablename,isunique,keypositions,options,predicate)
           ON ix.relname::text=e.name AND c.relname::text=e.tablename
         WHERE n.nspname='public' AND am.amname='btree' AND i.indisunique=e.isunique
           AND i.indkey=e.keypositions::pg_catalog.int2vector AND i.indoption=e.options::pg_catalog.int2vector
           AND i.indnatts=i.indnkeyatts
           AND CASE WHEN e.predicate='' THEN i.indpred IS NULL
               ELSE regexp_replace(pg_catalog.pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]|::text','','g')=e.predicate END) <> 7 THEN
    RAISE EXCEPTION 'MIGRATION_030_INDEX_CONTRACT_FAILED';
  END IF;
END
$billing030$;
""".replace('TABLE_NAMES',table_names).replace('COLUMN_COUNT',str(len(columns))).replace(
        'COLUMN_VALUES',sql_values(columns)).replace('CONSTRAINT_VALUES',sql_values(constraints)).replace(
        'INDEX_TOTALS',sql_values(index_totals)).replace('INDEX_VALUES',sql_values(indexes))


def seed_contract(sql030):
    verify_migration(sql030)
    checks=[]
    for table in ('billing_program_config','billing_plans','billing_usage_rates'):
        match=re.search(r'INSERT INTO '+table+r'\(([^)]+)\)\s*VALUES\s*(.*?);',sql030,re.S)
        if not match:stop('MIGRATION_030_SEED_MANIFEST_MISMATCH')
        columns,values=match.groups()
        projection=','.join('features::jsonb' if col=='features' else col for col in columns.split(','))
        checks.append('''IF EXISTS (WITH expected('''+columns+''') AS (VALUES '''+values+''')
          (SELECT '''+columns+''' FROM public.'''+table+''' EXCEPT SELECT '''+projection+''' FROM expected)
          UNION ALL
          (SELECT '''+projection+''' FROM expected EXCEPT SELECT '''+columns+''' FROM public.'''+table+''')) THEN
          RAISE EXCEPTION 'MIGRATION_030_SEED_CONTRACT_FAILED'; END IF;''')
    return """
DO $seeds030$
BEGIN
SEED_COMPARISONS
  IF EXISTS (SELECT 1 FROM public.billing_plans WHERE currency<>'SYP' OR currency_era<>'SYP_NEW_2026' OR NOT published)
     OR EXISTS (SELECT 1 FROM public.billing_usage_rates WHERE NOT active)
     OR (SELECT count(*) FROM public.billing_promo_codes)<>1
     OR (SELECT count(*) FROM public.billing_promo_codes WHERE code='KHEDMA30' AND percentage_off=30
          AND message_ar='عرض الانطلاق: استخدم كود KHEDMA30 واحصل على خصم 30% على أول باقة مدفوعة.'
          AND active AND valid_from<=clock_timestamp() AND valid_until=TIMESTAMPTZ '2026-12-31 23:59:59+03'
          AND max_redemptions IS NULL AND per_user_limit=1)<>1
     OR EXISTS (SELECT 1 FROM public.billing_purchase_orders)
     OR EXISTS (SELECT 1 FROM public.billing_subscriptions)
     OR EXISTS (SELECT 1 FROM public.billing_credit_grants)
     OR EXISTS (SELECT 1 FROM public.billing_credit_ledger)
     OR EXISTS (SELECT 1 FROM public.billing_usage_receipts)
     OR EXISTS (SELECT 1 FROM public.billing_promo_redemptions) THEN
    RAISE EXCEPTION 'MIGRATION_030_SEED_OR_EMPTY_TRANSACTION_TABLE_CONTRACT_FAILED';
  END IF;
END
$seeds030$;
""".replace('SEED_COMPARISONS','\n'.join(checks))


def postcondition_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030):
    verify_sources(taxi, fulfillment, predecessor, sql025, migrations, sql029, sql030)
    return (predecessor.catalog_guard(tables(taxi, fulfillment, predecessor, foundation),
             'MIGRATION_030_POSTCONDITION_FAILED',routine_count=7)
            + routine_trigger_contract(predecessor,sql025,migrations[1],sql029,sql030)
            + fulfillment.structural_contract() + taxi.structural_contract()
            + structural_contract(sql030) + seed_contract(sql030) + admin_role_predecessor_contract())


def build_preflight_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030):
    verify_sources(taxi, fulfillment, predecessor, sql025, migrations, sql029, sql030)
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            + taxi.postcondition_sql(fulfillment,predecessor,foundation,sql025,migrations,sql029)
            + absence_contract() + admin_role_predecessor_contract()
            + "ROLLBACK;\nSELECT 'PREVIEW_V2_BILLING_PREDECESSOR_ACK';\n")


def build_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030):
    verify_sources(taxi, fulfillment, predecessor, sql025, migrations, sql029, sql030)
    return ("""BEGIN READ WRITE;
SET LOCAL search_path=public,pg_catalog;
DO $lock030$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('khedmah-nonproduction-billing-030',0));
END
$lock030$;
""" + taxi.postcondition_sql(fulfillment,predecessor,foundation,sql025,migrations,sql029)
            + absence_contract() + admin_role_predecessor_contract() + sql030 + '\n'
            + postcondition_sql(taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030)
            + "COMMIT;\nSELECT 'PREVIEW_V2_BILLING_COMMIT_ACK';\n")


def build_readback_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030):
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            + postcondition_sql(taxi,fulfillment,predecessor,foundation,sql025,migrations,sql029,sql030)
            + "ROLLBACK;\nSELECT 'PREVIEW_V2_BILLING_READBACK_ACK';\n")


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

def verify_result(taxi, fulfillment, predecessor, foundation, value):
    expected = tables(taxi, fulfillment, predecessor, foundation)
    if (value.get('database') != 'khedmah' or value.get('user') != 'khedmah_migrator'
            or value.get('read_only') != 'on'
            or not 160000 <= value.get('server_version_num', 0) < 170000
            or value.get('relation_count') != 59 or value.get('routine_count') != 7
            or value.get('relation_inventory_complete') is not True
            or value.get('schemas') != [{'name':'public','owner':'pg_database_owner'}]
            or sorted(row.get('name','') for row in value.get('relations',[])) != expected):
        stop('MIGRATION_030_CATALOG_MISMATCH_NO_REPLAY')
    for row in value['relations']:
        if (row.get('schema') != 'public' or row.get('kind') != 'r'
                or row.get('owner') != 'khedmah_migrator'
                or any(row.get('runtime_'+op) is not False for op in ('select','insert','update','delete'))):
            stop('MIGRATION_030_OWNER_OR_GRANT_DRIFT_NO_REPLAY')
    predecessor.validate_roles(value)

def routine_trigger_contract(predecessor, sql025, sql027, sql029, sql030):
    bodies = re.findall(r'CREATE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;', sql025, re.S)
    bodies += re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\)\s+RETURNS TRIGGER AS \$\$(.*?)\$\$ LANGUAGE plpgsql;', sql027, re.S)
    bodies += re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+AS \$\$(.*?)\$\$;', sql029, re.S)
    bodies += re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;', sql030, re.S)
    names = sorted([*predecessor.FUNCTIONS, 'create_pending_mobility_document_review', 'reject_taxi_pricing_revision_mutation', 'reject_billing_ledger_mutation', 'grant_welcome_credit_on_login'])
    if sorted(name for name, body in bodies) != names:
        stop('MIGRATION_030_FUNCTION_MANIFEST_MISMATCH')
    functions = ','.join("('"+name+"',$body$"+body+"$body$)" for name,body in bodies)
    trigger_rows = [*predecessor.TRIGGERS,
                   ('media_assets_pending_mobility_document_review','media_assets','create_pending_mobility_document_review',5),
                   ('taxi_pricing_revisions_append_only','taxi_pricing_revisions','reject_taxi_pricing_revision_mutation',27),
                   ('billing_credit_ledger_no_rewrite','billing_credit_ledger','reject_billing_ledger_mutation',27),
                   ('billing_usage_receipts_no_rewrite','billing_usage_receipts','reject_billing_ledger_mutation',27),
                   ('billing_promo_redemptions_no_rewrite','billing_promo_redemptions','reject_billing_ledger_mutation',27),
                   ('billing_welcome_after_session','identity_sessions','grant_welcome_credit_on_login',5)]
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
            WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) <> 7 THEN
    RAISE EXCEPTION 'MIGRATION_030_ROUTINE_BODY_OWNER_OR_EXECUTE_DRIFT';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal) <> 11
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
           AND t.tgqual IS NULL AND t.tgattr=''::pg_catalog.int2vector) <> 11 THEN
    RAISE EXCEPTION 'MIGRATION_030_TRIGGER_BINDING_OR_STATE_DRIFT';
  END IF;
END
$routines$;
""".replace('FUNCTION_VALUES',functions).replace('TRIGGER_VALUES',triggers)

def execute_sql(reader, work, password, sql, marker):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "billing.pgpass"
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
        stop("MIGRATION_030_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != marker:
        stop("MIGRATION_030_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")

def apply_billing():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        taxi, fulfillment, predecessor, foundation, reader, sql025, migrations, sql029, sql030 = load_sources(work)
        sql = build_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030)
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
                taxi.verify_result(fulfillment, predecessor, foundation, reader.read_catalog(work, password))
                execute_sql(reader, work, password, build_preflight_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030),
                            "PREVIEW_V2_BILLING_PREDECESSOR_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_BILLING_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=49)), flush=True)
                execute_sql(reader, work, password, sql, "PREVIEW_V2_BILLING_COMMIT_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_BILLING_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(taxi, fulfillment, predecessor, foundation, catalog)
                execute_sql(reader, work, password, build_readback_sql(taxi, fulfillment, predecessor, foundation, sql025, migrations, sql029, sql030),
                            "PREVIEW_V2_BILLING_READBACK_ACK")
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_BILLING_030_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256=MIGRATION_SHA256,
            table_count=59, routine_count=7, trigger_count=11, expected_table_set_verified=True,
            migrator_ownership_verified=True, runtime_dml_grants_absent=True,
            runtime_function_execute_absent=True, billing_contract_verified_before_commit=True, billing_seed_contract_verified=True,
            configuration_seed_count=1, plan_seed_count=6, usage_rate_seed_count=4, promo_seed_count=1,
            billing_transaction_tables_empty=True, admin_role_constraint_unchanged=True, billing_admin_role_033_applied=False,
            predecessor_taxi_and_fulfillment_contracts_preserved=True, routine_trigger_contract_readback_verified=True,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            taxi_trips_enabled=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))

if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-billing"]:
        stop("USE_APPLY_BILLING_ONLY")
    os.umask(0o077)
    try:
        apply_billing()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATION_030_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
