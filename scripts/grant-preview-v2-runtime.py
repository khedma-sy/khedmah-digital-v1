#!/usr/bin/env python3
"""Grant the reviewed Preview runtime ACLs; no schema, data or cloud changes."""
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
SOURCE_COMMIT='1b480cbfcb8d2eade13d1d44b4ca4fb2a7620f31'
ACL_BLOB='6c9d5415f60902288c69f0910513d65479f2d950'
ACL_SHA256='13f93b5ffdc8a4f3cdec501bd965e2673be4f4418fe656484242c969e3cb2bb2'
PUBLIC_TABLES=tuple('''ad_free_slots ad_listings ad_moderation_events ad_request_receipts
admin_roles analytics_events audit_logs billing_credit_grants billing_credit_ledger billing_plans
billing_program_config billing_promo_codes billing_promo_redemptions billing_purchase_orders
billing_subscriptions billing_usage_rates billing_usage_receipts business_branches business_opening_hours
business_profiles business_social_links categories contact_action_events contact_inquiries
contact_submission_idempotency core_user_accounts email_verifications external_identities
food_promo_claims food_promo_codes fulfillment_order_events fulfillment_order_items
fulfillment_order_location_updates fulfillment_order_ratings fulfillment_orders identity_credentials
identity_sessions locations media_assets mobility_document_review_events mobility_document_reviews
nearby_notifications nearby_preferences organization_members organizations password_reset_tokens
permissions platform_notifications product_listings professional_profiles profiles provider_reports
rate_limit_buckets role_permissions roles service_listings supplier_capabilities taxi_pricing_revisions
trust_history verification_requests'''.split())
DRIVER_COLUMNS=tuple('business_profile_id vehicle_id zone_code status reviewed_by verification_reference decision_reason approved_at expires_at revision updated_at'.split())
VEHICLE_COLUMNS=tuple('driver_user_id status reviewed_by verification_reference decision_reason approved_at expires_at revision updated_at'.split())
TAXI_TABLES=('driver_approvals','operational_approval_events','vehicle_approvals')
ROLES=('khedmah_app','khedmah_runtime_role')
COMMIT_ACK='PREVIEW_V2_RUNTIME_GRANTS_COMMIT_ACK'


def stop(code):
    raise SystemExit('STOP: '+code)


def load_sources(work):
    # Bootstrap only this immutable, checksum-verified read helper. It verifies
    # the remaining nineteen sources before importing any verification contract.
    import base64
    env={k:v for k,v in os.environ.items() if k not in ('GH_DEBUG','DEBUG')}
    result=subprocess.run(['gh','api','--hostname','github.com','repos/'+REPO+'/git/blobs/'+ACL_BLOB],
                          capture_output=True,timeout=60,env=env)
    if result.returncode or len(result.stdout)>524288:stop('PINNED_ACL_SOURCE_READ_FAILED')
    value=json.loads(result.stdout)
    if value.get('sha')!=ACL_BLOB or value.get('encoding')!='base64':stop('PINNED_ACL_SOURCE_INVALID')
    data=base64.b64decode(''.join(value['content'].split()),validate=True)
    if (value.get('size')!=len(data) or hashlib.sha256(data).hexdigest()!=ACL_SHA256
            or hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=ACL_BLOB):
        stop('PINNED_ACL_SOURCE_CHECKSUM_MISMATCH')
    path=work/'schema_acl_contract.py';path.write_bytes(data)
    spec=importlib.util.spec_from_file_location('schema_acl_contract',path)
    acl=importlib.util.module_from_spec(spec);spec.loader.exec_module(acl)
    return (acl,*acl.load_sources(work))


def baseline():
    """Exact non-secret metadata returned by the owner on 2026-10-13 19:43 UTC."""
    effective=[dict(subject=r,kind=k,object=o,privilege=p,grantable=False)
        for r in ROLES for k,o,p in [('database','khedmah','CONNECT'),('schema','public','USAGE')]]
    return dict(database='khedmah',user='khedmah_migrator',session_user='khedmah_migrator',read_only='on',
        database_owner='cloudsqlsuperuser',counts=dict(schemas=2,relations=64,sequences=0,routines=9,triggers=12),
        schema_owners=[dict(schema='khedmah_taxi',owner='khedmah_migrator'),dict(schema='public',owner='pg_database_owner')],
        effective_count=4,effective_privileges=effective,explicit_count=2,explicit_privileges=[
            dict(kind='database',object='khedmah',grantee='khedmah_runtime_role',grantor='cloudsqlsuperuser',privilege='CONNECT',grantable=False),
            dict(kind='schema',object='public',grantee='khedmah_runtime_role',grantor='pg_database_owner',privilege='USAGE',grantable=False)],
        default_count=2,default_privileges=[dict(owner=r,schema='*',kind='f',grantee=r,grantor=r,privilege='EXECUTE',grantable=False)
            for r in ('khedmah_migration_role','khedmah_migrator')],
        membership_count=1,effective_memberships=[dict(subject='khedmah_app',role='khedmah_runtime_role',inherited=True)],
        runtime_ownership=[dict(role=r,databases=0,schemas=0,relations=0,routines=0,types=0) for r in ROLES],
        role_setting_rows=0,unvalidated_constraints=[
            dict(schema='public',table='business_profiles',constraint='business_profiles_category_code_fk'),
            dict(schema='public',table='service_listings',constraint='service_listings_category_code_fk')])


def validate_baseline(acl,value):
    acl.validate_inventory(value)
    if value!=baseline():stop('RUNTIME_GRANTS_BASELINE_DRIFT_NO_APPLY')


def values(items):
    if any(not re.fullmatch('[a-z_][a-z_0-9]*',s) for s in items):stop('GRANT_MANIFEST_INVALID')
    return ','.join("('"+s+"')" for s in items)


def validate_manifest(food,authority,args):
    admin,billing,taxi,fulfillment,predecessor,foundation,*sql=args
    public=set(billing.tables(taxi,fulfillment,predecessor,foundation)+food.TABLES)
    if (len(PUBLIC_TABLES)!=60 or len(set(PUBLIC_TABLES))!=60
            or public!=set(PUBLIC_TABLES)|{'category_taxonomy_022_before_image'}
            or len(DRIVER_COLUMNS)!=11 or len(VEHICLE_COLUMNS)!=9):
        stop('RUNTIME_GRANT_MANIFEST_MISMATCH')


def grant_sql():
    # No enumeration of live tables controls mutation. Every target is literal.
    return ('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE '+
        ', '.join('public.'+n for n in PUBLIC_TABLES)+' TO khedmah_runtime_role;\n'
        'GRANT USAGE ON SCHEMA khedmah_taxi TO khedmah_runtime_role;\n'
        'GRANT SELECT, INSERT ON TABLE khedmah_taxi.driver_approvals, khedmah_taxi.vehicle_approvals TO khedmah_runtime_role;\n'
        'GRANT UPDATE ('+', '.join(DRIVER_COLUMNS)+') ON TABLE khedmah_taxi.driver_approvals TO khedmah_runtime_role;\n'
        'GRANT UPDATE ('+', '.join(VEHICLE_COLUMNS)+') ON TABLE khedmah_taxi.vehicle_approvals TO khedmah_runtime_role;\n'
        'GRANT INSERT ON TABLE khedmah_taxi.operational_approval_events TO khedmah_runtime_role;\n'
        'GRANT EXECUTE ON FUNCTION khedmah_taxi.resolve_actor_locked(text,boolean) TO khedmah_runtime_role;\n')


def inventory_query(acl):
    # Entire arrays are compared inside PostgreSQL, never printed or truncated.
    sql=acl.INVENTORY_SQL.strip().removesuffix(';')
    if sql.count('LIMIT 300')!=4:stop('ACL_INVENTORY_MANIFEST_MISMATCH')
    return sql.replace('LIMIT 300','')


def expected_query():
    base=json.dumps(baseline(),separators=(',',':'))
    return """
WITH targets(name) AS (VALUES PUBLIC_VALUES),
table_acl(kind,object,privilege) AS (
 SELECT 'relation'::text,'public.'||t.name,q.p FROM targets t
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) q(p)
 UNION ALL SELECT 'relation','khedmah_taxi.'||t.name,q.p
 FROM (VALUES ('driver_approvals'),('vehicle_approvals')) t(name)
 CROSS JOIN (VALUES ('SELECT'),('INSERT')) q(p)
 UNION ALL SELECT 'relation','khedmah_taxi.operational_approval_events','INSERT'
), new_acl(kind,object,privilege) AS (
 SELECT * FROM table_acl
 UNION ALL SELECT 'column','khedmah_taxi.driver_approvals.'||name,'UPDATE' FROM (VALUES DRIVER_VALUES) d(name)
 UNION ALL SELECT 'column','khedmah_taxi.vehicle_approvals.'||name,'UPDATE' FROM (VALUES VEHICLE_VALUES) v(name)
 UNION ALL SELECT 'schema','khedmah_taxi','USAGE'
 UNION ALL SELECT 'routine','khedmah_taxi.resolve_actor_locked('||
 pg_get_function_identity_arguments('khedmah_taxi.resolve_actor_locked(text,boolean)'::regprocedure)||')','EXECUTE'
), explicit_expected AS (
 SELECT * FROM jsonb_to_recordset($baseline$BASELINE$baseline$::jsonb->'explicit_privileges')
 AS b(kind text,object text,grantee text,grantor text,privilege text,grantable boolean)
 UNION ALL SELECT kind,object,'khedmah_runtime_role','khedmah_migrator',privilege,false FROM new_acl
), effective_expected AS (
 SELECT * FROM jsonb_to_recordset($baseline$BASELINE$baseline$::jsonb->'effective_privileges')
 AS b(subject text,kind text,object text,privilege text,grantable boolean)
 UNION ALL SELECT s.name,CASE WHEN n.kind='relation' THEN 'table' ELSE n.kind END,n.object,n.privilege,false
 FROM new_acl n CROSS JOIN (VALUES ('khedmah_app'),('khedmah_runtime_role')) s(name)
 UNION ALL SELECT s.name,'column',t.object||'.'||a.attname,t.privilege,false
 FROM table_acl t JOIN pg_attribute a ON a.attrelid=t.object::regclass
 CROSS JOIN (VALUES ('khedmah_app'),('khedmah_runtime_role')) s(name)
 WHERE a.attnum>0 AND NOT a.attisdropped AND t.privilege IN ('SELECT','INSERT','UPDATE','REFERENCES')
)
SELECT $baseline$BASELINE$baseline$::jsonb || jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'explicit_count',(SELECT count(*) FROM explicit_expected),
 'explicit_privileges',(SELECT jsonb_agg(to_jsonb(e) ORDER BY kind,object,grantee,privilege) FROM explicit_expected e),
 'effective_count',(SELECT count(*) FROM effective_expected),
 'effective_privileges',(SELECT jsonb_agg(to_jsonb(e) ORDER BY subject,kind,object,privilege) FROM effective_expected e))
""".replace('PUBLIC_VALUES',values(PUBLIC_TABLES)).replace('DRIVER_VALUES',values(DRIVER_COLUMNS)).replace(
        'VEHICLE_VALUES',values(VEHICLE_COLUMNS)).replace('BASELINE',base)


# Hash structure privately, excluding the ACLs that this helper changes and
# volatile storage statistics. No function body/role setting/application row is output.
SCHEMA_QUERY="""
WITH ns AS (SELECT * FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'),
rels AS (SELECT c.* FROM pg_class c JOIN ns n ON n.oid=c.relnamespace),
metadata AS (
 SELECT 'namespace'::text AS kind,n.oid::text AS id,to_jsonb(n)-'nspacl' AS body FROM ns n
 UNION ALL SELECT 'relation',c.oid::text,to_jsonb(c)-ARRAY['relacl','relpages','reltuples','relallvisible','relfrozenxid','relminmxid'] FROM rels c
 UNION ALL SELECT 'attribute',a.attrelid::text||'.'||a.attnum,to_jsonb(a)-'attacl' FROM pg_attribute a JOIN rels c ON c.oid=a.attrelid
 UNION ALL SELECT 'default',d.oid::text,to_jsonb(d) FROM pg_attrdef d JOIN rels c ON c.oid=d.adrelid
 UNION ALL SELECT 'constraint',d.oid::text,to_jsonb(d) FROM pg_constraint d JOIN ns n ON n.oid=d.connamespace
 UNION ALL SELECT 'index',i.indexrelid::text,to_jsonb(i) FROM pg_index i JOIN rels c ON c.oid=i.indrelid
 UNION ALL SELECT 'routine',p.oid::text,to_jsonb(p)-'proacl' FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace
 UNION ALL SELECT 'trigger',t.oid::text,to_jsonb(t) FROM pg_trigger t JOIN rels c ON c.oid=t.tgrelid
 UNION ALL SELECT 'type',t.oid::text,to_jsonb(t) FROM pg_type t JOIN ns n ON n.oid=t.typnamespace
 UNION ALL SELECT 'policy',p.oid::text,to_jsonb(p) FROM pg_policy p JOIN rels c ON c.oid=p.polrelid
 UNION ALL SELECT 'role',r.oid::text,jsonb_build_object('name',r.rolname,'super',r.rolsuper,'inherit',r.rolinherit,
   'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication,'bypassrls',r.rolbypassrls,
   'login',r.rolcanlogin,'connections',r.rolconnlimit,'validuntil',r.rolvaliduntil)
 FROM pg_roles r WHERE r.rolname IN ('khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role')
 UNION ALL SELECT 'membership',m.oid::text,to_jsonb(m) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
 WHERE r.rolname IN ('khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role')
)
SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(m) ORDER BY kind,id),'[]'::jsonb)::text,'UTF8')),'hex') FROM metadata m
"""


def acl_assertion(acl):
    return ('SELECT ('+inventory_query(acl)+')::jsonb INTO observed;\n'
            'SELECT ('+expected_query()+') INTO expected;\n'
            "IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'RUNTIME_GRANTS_EXACT_ACL_MISMATCH'; END IF;\n")


def build_sql(acl,food,authority,args,sql034):
    validate_manifest(food,authority,args)
    before=json.dumps(dict(baseline(),read_only='off'),separators=(',',':'))
    locks=sorted(['public.'+n for n in (*PUBLIC_TABLES,'category_taxonomy_022_before_image')]
                 +['khedmah_taxi.'+n for n in TAXI_TABLES])
    return ("BEGIN READ WRITE;\nSET LOCAL search_path=pg_catalog;\n"
        "SELECT pg_advisory_xact_lock(hashtextextended('khedmah-preview-v2-runtime-grants-034',0));\n"
        'LOCK TABLE '+', '.join(locks)+' IN SHARE ROW EXCLUSIVE MODE;\n'
        +food.postcondition_sql(authority,args,sql034)+"""
DO $runtime_grants$
DECLARE observed jsonb; expected jsonb; before_digest text; after_digest text;
BEGIN
 SELECT (INVENTORY) ::jsonb INTO observed;
 IF observed IS DISTINCT FROM $baseline$OBSERVED_BASELINE_JSON$baseline$::jsonb THEN
   RAISE EXCEPTION 'RUNTIME_GRANTS_BASELINE_DRIFT_NO_APPLY';
 END IF;
 SELECT (SCHEMA) INTO before_digest;
 GRANTS
 ASSERTIONS
 SELECT (SCHEMA) INTO after_digest;
 IF before_digest IS DISTINCT FROM after_digest THEN RAISE EXCEPTION 'RUNTIME_GRANTS_SCHEMA_CHANGED'; END IF;
 PERFORM set_config('khedmah.preview_schema_digest',before_digest,true);
END
$runtime_grants$;
SELECT json_build_object('schema_digest',current_setting('khedmah.preview_schema_digest'),
 'table_count',64,'routine_count',9,'trigger_count',12,'acl_exact',true);
COMMIT;
SELECT 'PREVIEW_V2_RUNTIME_GRANTS_COMMIT_ACK';
""".replace('INVENTORY',inventory_query(acl)).replace('OBSERVED_BASELINE_JSON',before).replace('SCHEMA)',SCHEMA_QUERY+')').replace(
        '\n GRANTS\n','\n '+grant_sql()).replace('\n ASSERTIONS\n','\n '+acl_assertion(acl)))


def build_readback_sql(acl,digest):
    if not re.fullmatch('[0-9a-f]{64}',digest):stop('SCHEMA_DIGEST_INVALID')
    return ('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
        'DO $readback$ DECLARE observed jsonb; expected jsonb; actual_digest text; BEGIN\n'
        +acl_assertion(acl)+'SELECT ('+SCHEMA_QUERY+') INTO actual_digest;\n'
        "IF actual_digest IS DISTINCT FROM '"+digest+"' THEN RAISE EXCEPTION 'RUNTIME_GRANTS_SCHEMA_READBACK_DRIFT'; END IF;\n"
        "END $readback$;\nROLLBACK;\nSELECT 'PREVIEW_V2_RUNTIME_GRANTS_READBACK_ACK';\n")


def execute_sql(reader,work,password,sql,readback=False):
    if not re.fullmatch('[0-9a-f]{64}',password):stop('PASSWORD_FORMAT_REJECTED')
    socket_dir=str(work/reader.CONNECTION);pgpass=work/'runtime-grants.pgpass'
    with pgpass.open('x') as stream:
        os.chmod(pgpass,0o600)
        stream.write(socket_dir.replace('\\','\\\\').replace(':','\\:')+':5432:khedmah:khedmah_migrator:'+password+'\n')
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','CSQL_PROXY_','GOOGLE_'))}
    env.update(PGPASSFILE=str(pgpass),PGCONNECT_TIMEOUT='10',PGSSLMODE='disable',
        PGOPTIONS='-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000')
    try:
        result=subprocess.run(['psql','-X','-w','-q','-A','-t','-h',socket_dir,'-p','5432',
            '-U',reader.USER,'-d',reader.DATABASE,'-v','ON_ERROR_STOP=1','-P','pager=off'],
            input=sql,text=True,capture_output=True,timeout=600,env=env)
    except (OSError,subprocess.TimeoutExpired):stop('RUNTIME_GRANTS_RESULT_UNCONFIRMED_READ_BEFORE_RETRY')
    finally:pgpass.unlink(missing_ok=True)
    if result.returncode or len(result.stdout)>4096:stop('RUNTIME_GRANTS_RESULT_UNCONFIRMED_READ_BEFORE_RETRY')
    lines=[line.strip() for line in result.stdout.splitlines() if line.strip()]
    if readback:
        if lines!=['PREVIEW_V2_RUNTIME_GRANTS_READBACK_ACK']:stop('RUNTIME_GRANTS_READBACK_UNCONFIRMED')
        return None
    if len(lines)!=2 or lines[-1]!=COMMIT_ACK:stop('RUNTIME_GRANTS_COMMIT_UNCONFIRMED_READ_BEFORE_RETRY')
    try:value=json.loads(lines[0])
    except ValueError:stop('RUNTIME_GRANTS_COMMIT_RECEIPT_INVALID')
    if (not isinstance(value,dict) or set(value)!={'schema_digest','table_count','routine_count','trigger_count','acl_exact'}
            or value.get('acl_exact') is not True or value.get('table_count')!=64
            or value.get('routine_count')!=9 or value.get('trigger_count')!=12
            or not isinstance(value.get('schema_digest'),str) or not re.fullmatch('[0-9a-f]{64}',value['schema_digest'])):
        stop('RUNTIME_GRANTS_COMMIT_RECEIPT_INVALID')
    return value['schema_digest']


def apply_runtime_grants():
    if not all(shutil.which(c) for c in ('gh','gcloud','psql','cloud-sql-proxy')):
        stop('GH_GCLOUD_PSQL_AND_PROXY_REQUIRED')
    with tempfile.TemporaryDirectory(prefix='pv2-',dir='/tmp') as directory:
        work=Path(directory);os.chmod(work,0o700)
        acl,reader,food,authority,args,sql034=load_sources(work)
        sql=build_sql(acl,food,authority,args,sql034)
        reader.preflight()
        reader.validate_instance(reader.cloud('sql','instances','describe',reader.INSTANCE,
            fields='name,project,region,connectionName,state,databaseVersion'))
        version=reader.cloud('secrets','versions','describe','1','--secret='+reader.SECRET,fields='name,state')
        if version!={'name':reader.RESOURCE,'state':'ENABLED'}:stop('MIGRATION_SECRET_VERSION_ONE_NOT_VERIFIED')
        token=reader.cloud('auth','print-access-token').decode('ascii').strip()
        if not token or any(c.isspace() for c in token):stop('TOKEN_UNAVAILABLE')
        password=reader.read_password(token);proxy=None
        socket=work/reader.CONNECTION/'.s.PGSQL.5432'
        if len(str(socket).encode())>=104:stop('PRIVATE_SOCKET_PATH_TOO_LONG')
        try:
            with (work/'proxy.log').open('x') as log:
                os.chmod(work/'proxy.log',0o600)
                proxy=subprocess.Popen(['cloud-sql-proxy',reader.CONNECTION,'--unix-socket='+str(work)],
                    stdout=log,stderr=subprocess.STDOUT,env=reader.proxy_environment(token))
                deadline=time.monotonic()+45
                while not socket.exists():
                    if proxy.poll() is not None or time.monotonic()>=deadline:stop('PRIVATE_SQL_PROXY_NOT_READY')
                    time.sleep(0.25)
                if proxy.poll() is not None or not stat.S_ISSOCK(socket.stat().st_mode):stop('PRIVATE_SQL_PROXY_SOCKET_INVALID')
                food.verify_result(authority,args,reader.read_catalog(work,password))
                validate_baseline(acl,acl.execute_read(reader,work,password,acl.build_sql(food,authority,args,sql034)))
                print(json.dumps(dict(stage='PREVIEW_V2_RUNTIME_GRANTS_PREFLIGHT_PASSED',project=reader.PROJECT,
                    public_table_allowlist_count=60,taxi_table_count=3)),flush=True)
                digest=execute_sql(reader,work,password,sql)
                print(json.dumps(dict(stage='PREVIEW_V2_RUNTIME_GRANTS_COMMIT_ACKNOWLEDGED',project=reader.PROJECT)),flush=True)
                execute_sql(reader,work,password,build_readback_sql(acl,digest),readback=True)
        finally:reader.stop_proxy(proxy)
        print(json.dumps(dict(stage='PREVIEW_V2_RUNTIME_GRANTS_VERIFIED',project=reader.PROJECT,
            instance=reader.INSTANCE,database=reader.DATABASE,source_commit=SOURCE_COMMIT,
            table_count=64,routine_count=9,trigger_count=12,public_table_allowlist_count=60,
            taxi_table_count=3,taxi_update_column_count=20,runtime_grants_mutation=True,
            effective_and_explicit_acl_exact=True,column_and_inherited_privileges_verified=True,
            rollback_metadata_access_absent=True,runtime_create_and_grant_option_absent=True,
            schema_structure_ownership_and_routines_unchanged=True,default_privileges_unchanged=True,
            migration_secret_version='1',secret_payload_access=True,credential_values_printed=False,
            runtime_credential_access=False,runtime_login_tested=False,runtime_dml_tested=False,
            schema_mutation=False,application_data_mutation=False,application_data_rows_printed=False,
            cloud_resource_configuration_mutation=False,full_schema_ready=False,deployment_readiness_verified=False,
            taxi_trips_enabled=False,application_deployed=False,floot_connected=False,
            evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),sort_keys=True))


if __name__=='__main__':
    if sys.argv[1:]!=['--apply-runtime-grants']:stop('USE_APPLY_RUNTIME_GRANTS_ONLY')
    os.umask(0o077)
    try:apply_runtime_grants()
    except (OSError,ValueError,TypeError,KeyError,AttributeError,EOFError,subprocess.SubprocessError,KeyboardInterrupt):
        stop('RUNTIME_GRANTS_FAILURE_RECONCILE_BEFORE_RETRY')
