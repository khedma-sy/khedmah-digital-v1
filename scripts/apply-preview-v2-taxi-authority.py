#!/usr/bin/env python3
"""Apply canonical 031+032 atomically to the pinned, held replacement Preview."""
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
SOURCE_COMMIT = '3e7c49910fade9c2771ffba61acf6ff47cf25e44'
ADMIN_BLOB = '6d3bf861c2b36cf8188a446f290cdb0ae9514caf'
ADMIN_SHA256 = '53684da9c1d69cd11f34c46048b93fdee7f4b3da7397c667cf1ef15c33d5f264'
MIGRATIONS = [
    ('031_taxi_operational_approvals.sql','e557c132d1dff6ea4aadedcb25978a1c2d7cf410',
     '148dfe66ee1a2c838225a14fe90dcac51e8c7a87ee56d277275142e20bcc6f5b'),
    ('032_taxi_operational_profile_gate.sql','61b0a781714d4706b8edef1a6a711815e4720cbe',
     'fd99e0cd9b3c7763ed938080f8526d7d7a38335343c6b2ec379bd2a35f3ad588'),
]
TABLES = ['driver_approvals','operational_approval_events','vehicle_approvals']


def load_sources(work):
    admin = verified_module(work,'admin_contract',fetch_blob(ADMIN_BLOB),ADMIN_SHA256)
    billing,taxi,fulfillment,predecessor,foundation,reader,sql025,earlier,sql029,sql030,sql033=admin.load_sources(work)
    sql031,sql032=[fetch_blob(blob).decode('utf-8') for name,blob,checksum in MIGRATIONS]
    args=(admin,billing,taxi,fulfillment,predecessor,foundation,sql025,earlier,sql029,sql030,sql033,sql031,sql032)
    verify_sources(*args)
    return reader,args


def verify_sources(admin,billing,taxi,fulfillment,predecessor,foundation,sql025,earlier,sql029,sql030,sql033,sql031,sql032):
    admin.verify_sources(billing,taxi,fulfillment,predecessor,sql025,earlier,sql029,sql030,sql033)
    for (name,blob,checksum),sql in zip(MIGRATIONS,(sql031,sql032)):
        if hashlib.sha256(sql.encode()).hexdigest()!=checksum:
            stop('MIGRATIONS_031_032_CHECKSUM_MISMATCH')


def verify_result(args,value):
    admin,billing,taxi,fulfillment,predecessor,foundation,*sql=args
    public_names=billing.tables(taxi,fulfillment,predecessor,foundation)
    expected=sorted([('public',name) for name in public_names]+[('khedmah_taxi',name) for name in TABLES])
    if (value.get('relation_count')!=62 or value.get('routine_count')!=9
            or value.get('relation_inventory_complete') is not True
            or value.get('schemas')!=[{'name':'khedmah_taxi','owner':'khedmah_migrator'},
                                     {'name':'public','owner':'pg_database_owner'}]
            or sorted((row.get('schema',''),row.get('name','')) for row in value.get('relations',[]))!=expected):
        stop('MIGRATIONS_031_032_CATALOG_MISMATCH_NO_REPLAY')
    for row in value['relations']:
        if (row.get('kind')!='r' or row.get('owner')!='khedmah_migrator'
                or any(row.get('runtime_'+op) is not False for op in ('select','insert','update','delete'))):
            stop('MIGRATIONS_031_032_OWNER_OR_GRANT_DRIFT')
    # The complete mixed-schema inventory is checked above. Reuse the full 030 role,
    # identity and public-table checks on an explicit public-only projection.
    public=dict(value,relation_count=59,routine_count=7,
                schemas=[{'name':'public','owner':'pg_database_owner'}],
                relations=[row for row in value['relations'] if row['schema']=='public'])
    billing.verify_result(taxi,fulfillment,predecessor,foundation,public)


def predecessor_contract(args):
    admin,*rest=args
    return admin.postcondition_sql(*rest[:-2])


def retained_contract(args):
    """Only expand the permitted schema set and aggregate routine count."""
    admin,billing,taxi,fulfillment,predecessor,foundation,*sql=args
    baseline=predecessor_contract(args)
    old=predecessor.catalog_guard(billing.tables(taxi,fulfillment,predecessor,foundation),
                                 'MIGRATION_030_POSTCONDITION_FAILED',routine_count=7)
    if not baseline.startswith(old) or baseline.count(old)!=1:
        stop('MIGRATIONS_031_032_PREDECESSOR_MANIFEST_MISMATCH')
    allowed="nspname NOT IN ('public','information_schema')"
    if old.count(allowed)!=1:
        stop('MIGRATIONS_031_032_SCHEMA_MANIFEST_MISMATCH')
    expanded=predecessor.catalog_guard(billing.tables(taxi,fulfillment,predecessor,foundation),
                                      'MIGRATIONS_031_032_PUBLIC_POSTCONDITION_FAILED',routine_count=9)
    expanded=expanded.replace(allowed,"nspname NOT IN ('public','khedmah_taxi','information_schema')")
    # All other prior structure/seed/body/trigger/033 checks remain byte-identical.
    return expanded+baseline[len(old):]


def schema_contract():
    return """
DO $scope031$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_namespace n
      WHERE n.nspname='khedmah_taxi' AND pg_catalog.pg_get_userbyid(n.nspowner)='khedmah_migrator'
        AND NOT pg_catalog.has_schema_privilege('khedmah_app',n.oid,'USAGE')
        AND NOT pg_catalog.has_schema_privilege('khedmah_app',n.oid,'CREATE')
        AND NOT pg_catalog.has_schema_privilege('khedmah_runtime_role',n.oid,'USAGE')
        AND NOT pg_catalog.has_schema_privilege('khedmah_runtime_role',n.oid,'CREATE')
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
            coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE a.grantee=0))<>1 THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_SCHEMA_OWNER_OR_ACL_DRIFT';
  END IF;
  IF (SELECT array_agg(c.relname::text ORDER BY c.relname::text)
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='khedmah_taxi' AND c.relkind IN ('r','p','v','m','S','f'))
        IS DISTINCT FROM ARRAY['driver_approvals','operational_approval_events','vehicle_approvals']::text[]
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='khedmah_taxi' AND c.relkind IN ('r','p','v','m','S','f')
           AND (c.relkind<>'r' OR pg_catalog.pg_get_userbyid(c.relowner)<>'khedmah_migrator'
             OR c.relrowsecurity OR c.relforcerowsecurity
             OR pg_catalog.has_table_privilege('khedmah_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             OR pg_catalog.has_table_privilege('khedmah_runtime_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
                 coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE a.grantee=0))) THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_TABLE_OWNER_OR_ACL_DRIFT';
  END IF;
  IF EXISTS (SELECT 1 FROM khedmah_taxi.vehicle_approvals)
     OR EXISTS (SELECT 1 FROM khedmah_taxi.driver_approvals)
     OR EXISTS (SELECT 1 FROM khedmah_taxi.operational_approval_events) THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_APPROVAL_TABLES_NOT_EMPTY';
  END IF;
END
$scope031$;
"""


def table_manifest(sql031):
    if hashlib.sha256(sql031.encode()).hexdigest()!=MIGRATIONS[0][2]:
        stop('MIGRATIONS_031_032_CHECKSUM_MISMATCH')
    types={'TEXT':'text','BIGINT':'bigint','TIMESTAMPTZ':'timestamp with time zone'}
    definitions=re.findall(r'CREATE TABLE khedmah_taxi\.(\w+) \((.*?)\n\);',sql031,re.S)
    columns=[];keys=[];fkeys=[];counts=[]
    for table,body in definitions:
        rows=re.findall(r'^  (\w+) (TEXT|BIGINT|TIMESTAMPTZ)\b([^\n]*)',body,re.M)
        for i,(name,kind,rest) in enumerate(rows,1):
            columns.append((table,name,types[kind],i,'NOT NULL' in rest or 'PRIMARY KEY' in rest,'DEFAULT ' in rest))
            for token,tag in [('PRIMARY KEY','p'),('UNIQUE','u')]:
                if token in rest:keys.append((table,tag,i))
            ref=re.search(r'REFERENCES (\w+\.\w+)\((\w+)\) ON DELETE RESTRICT',rest)
            if ref:fkeys.append((table,i,*ref.groups()))
        counts.append((table,len(re.findall(r'\bCHECK\s*\(',body))))
    if (sorted(t for t,b in definitions)!=TABLES or len(columns)!=35 or len(keys)!=5
            or len(fkeys)!=10 or sum(n for t,n in counts)!=20):
        stop('MIGRATIONS_031_032_TABLE_MANIFEST_MISMATCH')
    return columns,keys,fkeys


def structural_contract(billing,sql031):
    columns,keys,fkeys=table_manifest(sql031)
    # pg_get_constraintdef canonicalizes IN to = ANY(ARRAY[...]); compare whole
    # normalized expressions rather than merely counting or matching substrings.
    checks=[]
    for table,actor,reviewer,reason,status in [
        ('vehicle_approvals','driver_user_id','reviewed_by','decision_reason','status'),
        ('driver_approvals','user_id','reviewed_by','decision_reason','status'),
        ('operational_approval_events','driver_user_id','actor_user_id','reason','decision')]:
        expr=[status+"=ANYARRAY['approved','suspended','revoked']",
              'char_lengthbtrimverification_reference>=5ANDchar_lengthbtrimverification_reference<=200',
              'char_lengthbtrim'+reason+'>=10ANDchar_lengthbtrim'+reason+'<=500',reviewer+'<>'+actor]
        if table!='vehicle_approvals':expr+=['char_lengthbtrimzone_code>=1ANDchar_lengthbtrimzone_code<=80']
        if table=='operational_approval_events':expr+=['driver_revision>0','vehicle_revision>0']
        else:expr+=['revision>0','expires_at>approved_at']
        checks.extend((table,'CHECK'+e) for e in expr)
    if len(checks)!=20:stop('MIGRATIONS_031_032_CHECK_MANIFEST_MISMATCH')
    return """
DO $tables031$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='khedmah_taxi' AND c.relkind='r' AND a.attnum>0)<>35
     OR (SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN (VALUES COLUMNS) e(tablename,name,typename,ordinal,required,hasdefault)
           ON c.relname::text=e.tablename AND a.attname::text=e.name AND a.attnum=e.ordinal
         LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
         WHERE n.nspname='khedmah_taxi' AND NOT a.attisdropped AND a.attnotnull=e.required
           AND pg_catalog.format_type(a.atttypid,a.atttypmod)=e.typename
           AND a.attidentity='' AND a.attgenerated='' AND a.atthasdef=e.hasdefault
           AND (NOT e.hasdefault OR pg_catalog.pg_get_expr(d.adbin,d.adrelid)='now()'))<>35 THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_COLUMN_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace
      WHERE n.nspname='khedmah_taxi')<>35
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace
         WHERE n.nspname='khedmah_taxi' AND (NOT x.convalidated OR x.condeferrable OR x.condeferred))
     OR EXISTS (SELECT 1 FROM (VALUES CHECKS) e(tablename,definition)
         WHERE (SELECT count(*) FROM pg_catalog.pg_constraint x
           WHERE x.conrelid=pg_catalog.to_regclass('khedmah_taxi.'||e.tablename) AND x.contype='c'
             AND regexp_replace(pg_catalog.pg_get_constraintdef(x.oid),'[[:space:]()]|::text','','g')=e.definition)<>1)
     OR EXISTS (SELECT 1 FROM (VALUES KEYS) e(tablename,kind,ordinal)
         WHERE (SELECT count(*) FROM pg_catalog.pg_constraint x
           WHERE x.conrelid=pg_catalog.to_regclass('khedmah_taxi.'||e.tablename) AND x.contype::text=e.kind
             AND x.conkey=ARRAY[e.ordinal]::smallint[])<>1)
     OR EXISTS (SELECT 1 FROM (VALUES FKEYS) e(tablename,ordinal,reference,target_column)
         WHERE (SELECT count(*) FROM pg_catalog.pg_constraint x
           JOIN pg_catalog.pg_attribute a ON a.attrelid=x.confrelid AND a.attnum=x.confkey[1]
           WHERE x.conrelid=pg_catalog.to_regclass('khedmah_taxi.'||e.tablename) AND x.contype='f'
             AND x.conkey=ARRAY[e.ordinal]::smallint[] AND cardinality(x.confkey)=1
             AND x.confrelid=pg_catalog.to_regclass(e.reference) AND a.attname::text=e.target_column
             AND NOT a.attisdropped AND x.confdeltype='r' AND x.confupdtype='a' AND x.confmatchtype='s')<>1) THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_CONSTRAINT_CONTRACT_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='khedmah_taxi')<>6
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='khedmah_taxi' AND (NOT i.indisvalid OR NOT i.indisready OR i.indexprs IS NOT NULL))
     OR (SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid
         JOIN pg_catalog.pg_am a ON a.oid=ix.relam
         WHERE i.indrelid='khedmah_taxi.operational_approval_events'::regclass
           AND ix.relname='taxi_operational_events_business_created_idx' AND a.amname='btree'
           AND NOT i.indisunique AND i.indnatts=2 AND i.indnkeyatts=2 AND i.indpred IS NULL
           AND i.indkey='2 12'::pg_catalog.int2vector AND i.indoption='0 3'::pg_catalog.int2vector)<>1 THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_INDEX_CONTRACT_FAILED';
  END IF;
END
$tables031$;
""".replace('COLUMNS',billing.sql_values(columns)).replace('CHECKS',billing.sql_values(checks)).replace(
        'FKEYS',billing.sql_values(fkeys)).replace('KEYS',billing.sql_values(keys))


def routine_contract(sql031,sql032):
    event=re.findall(r'FUNCTION khedmah_taxi\.reject_operational_approval_event_mutation\(\)\s+RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;',sql031,re.S)
    resolver=re.findall(r'LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS \$\$(.*?)\$\$;',sql032,re.S)
    if len(event)!=1 or len(resolver)!=1:stop('MIGRATIONS_031_032_ROUTINE_MANIFEST_MISMATCH')
    return """
DO $routines031$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='khedmah_taxi')<>2
     OR (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
         JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='khedmah_taxi'
           AND p.prokind='f' AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proparallel='u'
           AND NOT p.proisstrict AND NOT p.proleakproof AND p.pronargdefaults=0 AND p.provariadic=0
           AND pg_catalog.pg_get_userbyid(p.proowner)='khedmah_migrator'
           AND NOT pg_catalog.has_function_privilege('khedmah_app',p.oid,'EXECUTE')
           AND NOT pg_catalog.has_function_privilege('khedmah_runtime_role',p.oid,'EXECUTE')
           AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
             coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0)
           AND ((p.proname='reject_operational_approval_event_mutation' AND p.pronargs=0
               AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.proretset AND NOT p.prosecdef
               AND p.proconfig IS NULL AND p.prosrc=$event$EVENT_BODY$event$)
             OR (p.proname='resolve_actor_locked' AND p.pronargs=2 AND p.proargtypes='25 16'::pg_catalog.oidvector
               AND p.prorettype='pg_catalog.record'::regtype AND p.proretset AND p.prosecdef
               AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
               AND p.proargnames=ARRAY['session_hash','wants_driver','user_id','vehicle_id','zone_code',
                   'driver_revision','vehicle_revision','valid_until']::text[]
               AND p.proallargtypes=ARRAY[25,16,25,25,25,25,25,1184]::oid[]
               AND p.proargmodes=ARRAY['i','i','t','t','t','t','t','t']::"char"[]
               AND p.prosrc=$resolver$RESOLVER_BODY$resolver$)))<>2 THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_ROUTINE_BODY_SECURITY_OWNER_OR_EXECUTE_DRIFT';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='khedmah_taxi' AND NOT t.tgisinternal)<>1
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t
         WHERE t.tgrelid='khedmah_taxi.operational_approval_events'::regclass AND NOT t.tgisinternal
           AND t.tgname='taxi_operational_approval_events_append_only'
           AND t.tgfoid='khedmah_taxi.reject_operational_approval_event_mutation()'::regprocedure
           AND t.tgtype=27 AND t.tgenabled='O' AND t.tgconstraint=0 AND t.tgnargs=0
           AND t.tgqual IS NULL AND t.tgattr=''::pg_catalog.int2vector)<>1 THEN
    RAISE EXCEPTION 'MIGRATIONS_031_032_TRIGGER_CONTRACT_FAILED';
  END IF;
END
$routines031$;
""".replace('EVENT_BODY',event[0]).replace('RESOLVER_BODY',resolver[0])


def postcondition_sql(args):
    verify_sources(*args)
    return retained_contract(args)+schema_contract()+structural_contract(args[1],args[-2])+routine_contract(*args[-2:])


def build_preflight_sql(args):
    verify_sources(*args)
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'+predecessor_contract(args)
            +"ROLLBACK;\nSELECT 'PREVIEW_V2_TAXI_AUTHORITY_PREDECESSOR_ACK';\n")


def build_sql(args):
    verify_sources(*args)
    return ("""BEGIN READ WRITE;
SET LOCAL search_path=public,pg_catalog;
DO $lock031032$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khedmah-nonproduction-taxi-operational-031',0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khedmah-nonproduction-taxi-operational-032',0));
END
$lock031032$;
"""+predecessor_contract(args)+args[-2]+'\n'+args[-1]+'\n'+postcondition_sql(args)
            +"COMMIT;\nSELECT 'PREVIEW_V2_TAXI_AUTHORITY_COMMIT_ACK';\n")


def build_readback_sql(args):
    return ('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'+postcondition_sql(args)
            +"ROLLBACK;\nSELECT 'PREVIEW_V2_TAXI_AUTHORITY_READBACK_ACK';\n")


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
    pgpass = work / "taxi-authority.pgpass"
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
        stop("MIGRATIONS_031_032_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or result.stdout.strip() != marker:
        stop("MIGRATIONS_031_032_RESULT_UNCONFIRMED_READ_CATALOG_BEFORE_RETRY")


def apply_taxi_authority():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, args = load_sources(work)
        admin, billing, taxi, fulfillment, predecessor, foundation, *source_sql = args
        sql = build_sql(args)
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
                execute_sql(reader, work, password, build_preflight_sql(args),
                            "PREVIEW_V2_TAXI_AUTHORITY_PREDECESSOR_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_TAXI_AUTHORITY_PREFLIGHT_PASSED",
                    project=reader.PROJECT, predecessor_table_count=59)), flush=True)
                execute_sql(reader, work, password, sql, "PREVIEW_V2_TAXI_AUTHORITY_COMMIT_ACK")
                print(json.dumps(dict(stage="PREVIEW_V2_TAXI_AUTHORITY_COMMIT_ACKNOWLEDGED",
                    project=reader.PROJECT)), flush=True)
                catalog = reader.read_catalog(work, password)
                verify_result(args, catalog)
                execute_sql(reader, work, password, build_readback_sql(args),
                            "PREVIEW_V2_TAXI_AUTHORITY_READBACK_ACK")
        finally:
            reader.stop_proxy(proxy)
        print(json.dumps(dict(stage="PREVIEW_V2_TAXI_AUTHORITY_031_032_VERIFIED",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, migration_sha256={name:sha for name,blob,sha in MIGRATIONS},
            table_count=62, routine_count=9, trigger_count=12, expected_table_set_verified=True,
            migrator_ownership_verified=True, runtime_dml_grants_absent=True,
            runtime_function_execute_absent=True, runtime_taxi_schema_access_absent=True,
            predecessor_billing_admin_taxi_fulfillment_contracts_preserved=True,
            billing_admin_role_033_preserved=True, billing_seed_contract_verified=True,
            taxi_authority_contract_verified_before_commit=True,
            hardened_032_resolver_body_and_security_verified=True,
            approval_tables_empty=True, approval_assignment_dml_executed=False,
            routine_trigger_contract_readback_verified=True,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=True, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, full_schema_ready=False,
            taxi_trips_enabled=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))

if __name__ == "__main__":
    if sys.argv[1:] != ["--apply-taxi-authority"]:
        stop("USE_APPLY_TAXI_AUTHORITY_ONLY")
    os.umask(0o077)
    try:
        apply_taxi_authority()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("MIGRATIONS_031_032_LOCAL_OR_READBACK_FAILURE_RECONCILE_BEFORE_RETRY")
