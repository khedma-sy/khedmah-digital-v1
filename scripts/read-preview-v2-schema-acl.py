#!/usr/bin/env python3
"""Inspect the verified Preview schema and privilege metadata without mutation."""
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
SOURCE_COMMIT='ec2b4ee107070639a11c41d469b145f16110d3c9'
FOOD_BLOB='658601e207ffa05f9fad0e92b7909accf42fc6b1'
FOOD_SHA256='655a147f915e5d948d919865e226accd6800a3706006b617245626bf15336678'
RUNTIME_ROLES=('khedmah_app','khedmah_runtime_role')
ROW_LIMIT=300


def load_sources(work):
    food=verified_module(work,'food_contract',fetch_blob(FOOD_BLOB),FOOD_SHA256)
    reader,authority,args,sql034=food.load_sources(work)
    return reader,food,authority,args,sql034


INVENTORY_SQL="""
WITH subjects(name) AS (VALUES ('khedmah_app'),('khedmah_runtime_role'),('public')),
ns AS (SELECT * FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'),
relations AS (SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN ns n ON n.oid=c.relnamespace
              WHERE c.relkind IN ('r','p','v','m','S','f')),
routines AS (SELECT p.*,n.nspname FROM pg_catalog.pg_proc p JOIN ns n ON n.oid=p.pronamespace),
effective AS (
  SELECT s.name AS subject,'database'::text AS kind,current_database()::text AS object,q.privilege,
         has_database_privilege(s.name::name,current_database(),q.privilege||' WITH GRANT OPTION') AS grantable
    FROM subjects s CROSS JOIN (VALUES ('CONNECT'),('CREATE'),('TEMP')) q(privilege)
    WHERE has_database_privilege(s.name::name,current_database(),q.privilege)
  UNION ALL
  SELECT s.name,'schema',n.nspname::text,q.privilege,
         has_schema_privilege(s.name::name,n.oid,q.privilege||' WITH GRANT OPTION')
    FROM subjects s CROSS JOIN ns n CROSS JOIN (VALUES ('USAGE'),('CREATE')) q(privilege)
    WHERE has_schema_privilege(s.name::name,n.oid,q.privilege)
  UNION ALL
  SELECT s.name,'table',c.nspname||'.'||c.relname,q.privilege,
         has_table_privilege(s.name::name,c.oid,q.privilege||' WITH GRANT OPTION')
    FROM subjects s CROSS JOIN relations c
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) q(privilege)
    WHERE c.relkind<>'S' AND has_table_privilege(s.name::name,c.oid,q.privilege)
  UNION ALL
  SELECT s.name,'column',c.nspname||'.'||c.relname||'.'||a.attname,q.privilege,
         has_column_privilege(s.name::name,c.oid,a.attnum,q.privilege||' WITH GRANT OPTION')
    FROM subjects s CROSS JOIN relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) q(privilege)
    WHERE c.relkind<>'S' AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege(s.name::name,c.oid,a.attnum,q.privilege)
  UNION ALL
  SELECT s.name,'sequence',c.nspname||'.'||c.relname,q.privilege,
         has_sequence_privilege(s.name::name,c.oid,q.privilege||' WITH GRANT OPTION')
    FROM subjects s CROSS JOIN relations c CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) q(privilege)
    WHERE c.relkind='S' AND has_sequence_privilege(s.name::name,c.oid,q.privilege)
  UNION ALL
  SELECT s.name,'routine',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','EXECUTE',
         has_function_privilege(s.name::name,p.oid,'EXECUTE WITH GRANT OPTION')
    FROM subjects s CROSS JOIN routines p WHERE has_function_privilege(s.name::name,p.oid,'EXECUTE')
),
explicit_acl AS (
  SELECT 'database'::text AS kind,current_database()::text AS object,x.*
    FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) x
    WHERE d.datname=current_database()
  UNION ALL
  SELECT 'schema',n.nspname::text,x.* FROM ns n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x
  UNION ALL
  SELECT 'relation',c.nspname||'.'||c.relname,x.* FROM relations c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x
  UNION ALL
  SELECT 'column',c.nspname||'.'||c.relname||'.'||a.attname,x.*
    FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid
    CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'routine',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',x.*
    FROM routines p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
),
focus_acl AS (
 SELECT kind,object,CASE WHEN grantee=0 THEN 'public' ELSE pg_get_userbyid(grantee)::text END AS grantee,
        pg_get_userbyid(grantor)::text AS grantor,privilege_type AS privilege,is_grantable AS grantable
 FROM explicit_acl WHERE grantee=0 OR grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('khedmah_app','khedmah_runtime_role'))
),
defaults AS (
 SELECT pg_get_userbyid(d.defaclrole)::text AS owner,coalesce(n.nspname::text,'*') AS schema,
        d.defaclobjtype::text AS kind,CASE WHEN x.grantee=0 THEN 'public' ELSE pg_get_userbyid(x.grantee)::text END AS grantee,
        pg_get_userbyid(x.grantor)::text AS grantor,x.privilege_type AS privilege,x.is_grantable AS grantable
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 CROSS JOIN LATERAL aclexplode(d.defaclacl) x
),
memberships AS (
 SELECT r.rolname::text AS subject,g.rolname::text AS role,pg_has_role(r.oid,g.oid,'USAGE') AS inherited
 FROM pg_roles r CROSS JOIN pg_roles g
 WHERE r.rolname IN ('khedmah_app','khedmah_runtime_role') AND r.oid<>g.oid AND pg_has_role(r.oid,g.oid,'MEMBER')
)
SELECT json_build_object(
 'database',current_database(),'user',current_user,'session_user',session_user,
 'read_only',current_setting('transaction_read_only'),
 'database_owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'counts',json_build_object('schemas',(SELECT count(*) FROM ns),'relations',(SELECT count(*) FROM relations),
    'sequences',(SELECT count(*) FROM relations WHERE relkind='S'),'routines',(SELECT count(*) FROM routines),
    'triggers',(SELECT count(*) FROM pg_trigger t JOIN relations c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal)),
 'schema_owners',(SELECT json_agg(json_build_object('schema',nspname,'owner',pg_get_userbyid(nspowner)) ORDER BY nspname) FROM ns),
 'effective_count',(SELECT count(*) FROM effective),
 'effective_privileges',(SELECT coalesce(json_agg(e ORDER BY subject,kind,object,privilege),'[]'::json)
    FROM (SELECT * FROM effective ORDER BY subject,kind,object,privilege LIMIT 300) e),
 'explicit_count',(SELECT count(*) FROM focus_acl),
 'explicit_privileges',(SELECT coalesce(json_agg(e ORDER BY kind,object,grantee,privilege),'[]'::json)
    FROM (SELECT * FROM focus_acl ORDER BY kind,object,grantee,privilege LIMIT 300) e),
 'default_count',(SELECT count(*) FROM defaults),
 'default_privileges',(SELECT coalesce(json_agg(e ORDER BY owner,schema,kind,grantee,privilege),'[]'::json)
    FROM (SELECT * FROM defaults ORDER BY owner,schema,kind,grantee,privilege LIMIT 300) e),
 'membership_count',(SELECT count(*) FROM memberships),
 'effective_memberships',(SELECT coalesce(json_agg(e ORDER BY subject,role),'[]'::json)
    FROM (SELECT * FROM memberships ORDER BY subject,role LIMIT 300) e),
 'runtime_ownership',(SELECT json_agg(json_build_object('role',r.rolname,
    'databases',(SELECT count(*) FROM pg_database WHERE datdba=r.oid),
    'schemas',(SELECT count(*) FROM pg_namespace WHERE nspowner=r.oid),
    'relations',(SELECT count(*) FROM pg_class WHERE relowner=r.oid),
    'routines',(SELECT count(*) FROM pg_proc WHERE proowner=r.oid),
    'types',(SELECT count(*) FROM pg_type WHERE typowner=r.oid)) ORDER BY r.rolname)
    FROM pg_roles r WHERE r.rolname IN ('khedmah_app','khedmah_runtime_role')),
 'role_setting_rows',(SELECT count(*) FROM pg_db_role_setting d
    WHERE (d.setdatabase=0 OR d.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()))
      AND (d.setrole=0 OR d.setrole IN (SELECT oid FROM pg_roles WHERE rolname IN
        ('khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role')))),
 'unvalidated_constraints',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,
      'table',c.relname,'constraint',x.conname) ORDER BY n.nspname,c.relname,x.conname),'[]'::json)
    FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN ns n ON n.oid=c.relnamespace WHERE NOT x.convalidated)
);
"""


def build_sql(food,authority,args,sql034):
    # Import verification contracts only; never call an apply builder/entrypoint.
    return ('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
            +food.postcondition_sql(authority,args,sql034)+INVENTORY_SQL+'ROLLBACK;\n')


def validate_inventory(value):
    required={'database','user','session_user','read_only','database_owner','counts','schema_owners',
              'effective_count','effective_privileges','explicit_count','explicit_privileges',
              'default_count','default_privileges','membership_count','effective_memberships',
              'runtime_ownership','role_setting_rows','unvalidated_constraints'}
    if (not isinstance(value,dict) or set(value)!=required or value['database']!='khedmah'
            or value['user']!='khedmah_migrator' or value['session_user']!='khedmah_migrator'
            or value['read_only']!='on' or value['counts']!={'schemas':2,'relations':64,'sequences':0,'routines':9,'triggers':12}
            or value['schema_owners']!=[{'schema':'khedmah_taxi','owner':'khedmah_migrator'},
                                       {'schema':'public','owner':'pg_database_owner'}]
            or not isinstance(value['database_owner'],str)
            or any(type(v) is not int for v in value['counts'].values())):
        stop('SCHEMA_ACL_IDENTITY_OR_INVENTORY_MISMATCH')
    fields={
      'effective_privileges':('effective_count',{'subject','kind','object','privilege','grantable'}),
      'explicit_privileges':('explicit_count',{'kind','object','grantee','grantor','privilege','grantable'}),
      'default_privileges':('default_count',{'owner','schema','kind','grantee','grantor','privilege','grantable'}),
      'effective_memberships':('membership_count',{'subject','role','inherited'}),
    }
    for name,(count,keys) in fields.items():
        rows=value[name]
        if (type(value[count]) is not int or not 0<=value[count]<=ROW_LIMIT or not isinstance(rows,list)
                or len(rows)!=value[count] or any(not isinstance(row,dict) or set(row)!=keys for row in rows)):
            stop('SCHEMA_ACL_RESPONSE_INCOMPLETE_OR_INVALID')
        for row in rows:
            for key,item in row.items():
                if key in ('grantable','inherited'):
                    if type(item) is not bool:stop('SCHEMA_ACL_RESPONSE_INVALID')
                elif not isinstance(item,str) or not item or len(item)>512:
                    stop('SCHEMA_ACL_RESPONSE_INVALID')
    if (type(value['role_setting_rows']) is not int or value['role_setting_rows']<0
            or not isinstance(value['runtime_ownership'],list) or len(value['runtime_ownership'])!=2):
        stop('SCHEMA_ACL_RESPONSE_INVALID')
    for row,role in zip(value['runtime_ownership'],RUNTIME_ROLES):
        if (not isinstance(row,dict) or set(row)!={'role','databases','schemas','relations','routines','types'}
                or row['role']!=role or any(type(row[k]) is not int or row[k]<0 for k in row if k!='role')):
            stop('SCHEMA_ACL_RESPONSE_INVALID')
    constraints=value['unvalidated_constraints']
    if (not isinstance(constraints,list) or len(constraints)>100
            or any(not isinstance(row,dict) or set(row)!={'schema','table','constraint'}
                   or any(not isinstance(v,str) or len(v)>128 for v in row.values()) for row in constraints)):
        stop('SCHEMA_ACL_RESPONSE_INVALID')
    return value


def execute_read(reader,work,password,sql):
    if not re.fullmatch(r'[0-9a-f]{64}',password):stop('PASSWORD_FORMAT_REJECTED')
    pgpass=work/'schema-acl.pgpass';socket_dir=str(work/reader.CONNECTION)
    with pgpass.open('x') as stream:
        os.chmod(pgpass,0o600)
        stream.write(socket_dir.replace('\\','\\\\').replace(':','\\:')+':5432:khedmah:khedmah_migrator:'+password+'\n')
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','CSQL_PROXY_','GOOGLE_'))}
    env.update(PGPASSFILE=str(pgpass),PGCONNECT_TIMEOUT='10',PGSSLMODE='disable',
        PGOPTIONS='-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000')
    try:
        result=subprocess.run(['psql','-X','-w','-q','-A','-t','-h',socket_dir,'-p','5432',
            '-U',reader.USER,'-d',reader.DATABASE,'-v','ON_ERROR_STOP=1','-P','pager=off'],
            input=sql,text=True,capture_output=True,timeout=300,env=env)
    except (OSError,subprocess.TimeoutExpired):stop('SCHEMA_ACL_READ_UNCONFIRMED')
    finally:pgpass.unlink(missing_ok=True)
    if result.returncode or len(result.stdout)>262144:stop('SCHEMA_ACL_READ_FAILED_OR_TOO_LARGE')
    try:value=json.loads(result.stdout)
    except ValueError:stop('SCHEMA_ACL_RESPONSE_INVALID')
    return validate_inventory(value)


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


def inspect_schema_acl():
    if not all(shutil.which(command) for command in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("GH_GCLOUD_PSQL_AND_PROXY_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, food, authority, args, sql034 = load_sources(work)
        sql = build_sql(food, authority, args, sql034)
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
                food.verify_result(authority, args, reader.read_catalog(work, password))
                inventory = execute_read(reader, work, password, sql)
        finally:
            reader.stop_proxy(proxy)
        object_access=any(row['subject'] in RUNTIME_ROLES and row['kind'] in
                          ('table','column','sequence','routine') for row in inventory['effective_privileges'])
        print(json.dumps(dict(stage="PREVIEW_V2_SCHEMA_ACL_READ_COMPLETED_NO_MUTATION",
            project=reader.PROJECT, instance=reader.INSTANCE, database=reader.DATABASE,
            source_commit=SOURCE_COMMIT, catalog=inventory,
            table_count=64, routine_count=9, trigger_count=12, inventory_complete=True,
            schema_contracts_through_034_verified=True, runtime_object_grants_absent_observed=not object_access,
            runtime_credential_access=False, runtime_login_tested=False,
            migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
            schema_mutation=False, runtime_grants_mutation=False, application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False, grant_changes_prepared=False,
            full_schema_ready=False, deployment_readiness_verified=False,
            taxi_trips_enabled=False, application_deployed=False, floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))

if __name__ == "__main__":
    if sys.argv[1:] != ["--inspect"]:
        stop("USE_INSPECT_ONLY")
    os.umask(0o077)
    try:
        inspect_schema_acl()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("SCHEMA_ACL_READ_UNCONFIRMED_NO_MUTATION")
