#!/usr/bin/env python3
"""Reconcile Preview ACLs or verify the runtime login, using read-only sessions."""
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
import urllib.error
import urllib.request

REPO='khedma-sy/khedmah-digital-v1'
SOURCE_COMMIT='93e087e01c309a276418aba4272e3a9cce10fdba'
GRANT_BLOB='4c903b4dfe3bf0e3b510ff5002d0c7e9df39fad0'
GRANT_SHA256='275ddbb90fd3e3e936520c1a5601f8b4e4927da43c2855550cf30ee4fb7741d2'
RUNTIME_USER='khedmah_app'
RUNTIME_SECRET='DATABASE_URL'


def stop(code):
    raise SystemExit('STOP: '+code)


def load_sources(work):
    env={k:v for k,v in os.environ.items() if k not in ('GH_DEBUG','DEBUG')}
    result=subprocess.run(['gh','api','--hostname','github.com','repos/'+REPO+'/git/blobs/'+GRANT_BLOB],
                          capture_output=True,timeout=60,env=env)
    if result.returncode or len(result.stdout)>524288:stop('PINNED_GRANT_SOURCE_READ_FAILED')
    value=json.loads(result.stdout)
    if value.get('sha')!=GRANT_BLOB or value.get('encoding')!='base64':stop('PINNED_GRANT_SOURCE_INVALID')
    data=base64.b64decode(''.join(value['content'].split()),validate=True)
    if (value.get('size')!=len(data) or hashlib.sha256(data).hexdigest()!=GRANT_SHA256
            or hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=GRANT_BLOB):
        stop('PINNED_GRANT_SOURCE_CHECKSUM_MISMATCH')
    path=work/'grant_contract.py';path.write_bytes(data)
    spec=importlib.util.spec_from_file_location('grant_contract',path)
    grants=importlib.util.module_from_spec(spec);spec.loader.exec_module(grants)
    return (grants,*grants.load_sources(work))


def verify_structure(grants,reader,args,value):
    # Compare the real catalog, without rewriting any observed ACL values.
    expected=sorted([('public',n) for n in (*grants.PUBLIC_TABLES,'category_taxonomy_022_before_image')]
                    +[('khedmah_taxi',n) for n in grants.TAXI_TABLES])
    if (value.get('database')!=reader.DATABASE or value.get('user')!=reader.USER
            or value.get('read_only')!='on' or value.get('relation_inventory_complete') is not True
            or value.get('relation_count')!=64 or value.get('routine_count')!=9
            or value.get('schemas')!=[dict(name='khedmah_taxi',owner='khedmah_migrator'),dict(name='public',owner='pg_database_owner')]
            or sorted((row.get('schema',''),row.get('name','')) for row in value.get('relations',[]))!=expected
            or any(row.get('kind')!='r' or row.get('owner')!='khedmah_migrator' for row in value['relations'])):
        stop('RUNTIME_VERIFICATION_CATALOG_DRIFT')
    args[4].validate_roles(value)


def identity_guard(user):
    if user not in ('khedmah_migrator',RUNTIME_USER):stop('SQL_USER_REJECTED')
    return """
 IF current_database()<>'khedmah' OR current_user<>'EXPECTED_USER' OR session_user<>'EXPECTED_USER'
    OR current_setting('transaction_read_only')<>'on'
    OR current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user
               AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
   RAISE EXCEPTION 'RUNTIME_READ_IDENTITY_OR_PRIVILEGE_MISMATCH';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname IN ('public','khedmah_taxi') AND c.relkind IN ('r','p')
              AND (c.relrowsecurity OR c.relforcerowsecurity)) THEN
   RAISE EXCEPTION 'RUNTIME_READ_UNEXPECTED_ROW_SECURITY';
 END IF;
""".replace('EXPECTED_USER',user)


def state_sql(grants,acl):
    baseline=json.dumps(grants.baseline(),separators=(',',':'))
    return ('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
        'DO $state$ DECLARE observed jsonb; expected jsonb; acl_state text; BEGIN\n'
        +identity_guard('khedmah_migrator')+'SELECT ('+grants.inventory_query(acl)+')::jsonb INTO observed;\n'
        +'SELECT ('+grants.expected_query()+') INTO expected;\n'
        +'IF observed=$baseline$'+baseline+"$baseline$::jsonb THEN acl_state:='GRANTS_NOT_APPLIED';\n"
        +"ELSIF observed=expected THEN acl_state:='EXPECTED_GRANTS_PRESENT';\n"
        +"ELSE RAISE EXCEPTION 'RUNTIME_ACL_DRIFT_REVIEW_REQUIRED'; END IF;\n"
        +"PERFORM set_config('khedmah.preview_acl_state',acl_state,true);\nEND $state$;\n"
        +"SELECT json_build_object('acl_state',current_setting('khedmah.preview_acl_state'),"
        +"'database',current_database(),'user',current_user,'session_user',session_user,"
        +"'read_only',current_setting('transaction_read_only'),'table_count',64,'routine_count',9,'trigger_count',12);\nROLLBACK;\n")


def runtime_sql(grants,acl):
    allowed=['public.'+name for name in grants.PUBLIC_TABLES]+[
        'khedmah_taxi.driver_approvals','khedmah_taxi.vehicle_approvals']
    probes='\n'.join('PERFORM 1 FROM '+name+' WHERE false;' for name in allowed)
    return ('BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;\nSET LOCAL search_path=pg_catalog;\n'
        'DO $runtime$ DECLARE observed jsonb; expected jsonb; BEGIN\n'+identity_guard(RUNTIME_USER)
        +'SELECT ('+grants.inventory_query(acl)+')::jsonb INTO observed;\n'
        +'SELECT ('+grants.expected_query()+") || jsonb_build_object('user','khedmah_app','session_user','khedmah_app') INTO expected;\n"
        +"IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'RUNTIME_LOGIN_ACL_MISMATCH'; END IF;\n"
        +probes+"\nBEGIN\n PERFORM 1 FROM public.category_taxonomy_022_before_image WHERE false;\n"
        +" RAISE EXCEPTION 'RUNTIME_ROLLBACK_METADATA_READ_UNEXPECTEDLY_ALLOWED';\n"
        +"EXCEPTION WHEN insufficient_privilege THEN NULL; END;\n"
        +"BEGIN\n PERFORM 1 FROM khedmah_taxi.operational_approval_events WHERE false;\n"
        +" RAISE EXCEPTION 'RUNTIME_TAXI_EVENT_READ_UNEXPECTEDLY_ALLOWED';\n"
        +"EXCEPTION WHEN insufficient_privilege THEN NULL; END;\nEND $runtime$;\n"
        +"SELECT json_build_object('database',current_database(),'user',current_user,'session_user',session_user,"
        +"'read_only',current_setting('transaction_read_only'),'acl_exact',true,'allowed_select_probes',62,"
        +"'denied_select_probes',2,'table_count',64,'routine_count',9,'trigger_count',12);\nROLLBACK;\n")


def read_runtime_password(reader,token):
    resource='projects/'+reader.NUMBER+'/secrets/'+RUNTIME_SECRET+'/versions/1'
    request=urllib.request.Request('https://secretmanager.googleapis.com/v1/'+resource+':access',method='GET',
        headers={'Authorization':'Bearer '+token,'x-goog-user-project':reader.PROJECT})
    try:
        with urllib.request.build_opener(reader.NoRedirect).open(request,timeout=45) as response:
            raw=response.read(16385)
        if len(raw)>16384:stop('RUNTIME_SECRET_RESPONSE_TOO_LARGE')
        value=json.loads(raw)
        if value.get('name')!=resource:stop('RUNTIME_SECRET_IDENTITY_MISMATCH')
        payload=base64.b64decode(value['payload']['data'],validate=True).decode('ascii')
        match=re.fullmatch(r'postgresql://khedmah_app:([0-9a-f]{64})@localhost/khedmah',payload)
        if not match:stop('RUNTIME_SECRET_CONNECTION_TARGET_REJECTED')
        return match.group(1)
    except urllib.error.HTTPError as error:stop('RUNTIME_SECRET_ACCESS_HTTP_'+str(error.code))
    except (OSError,ValueError,KeyError,TypeError,UnicodeError):stop('RUNTIME_SECRET_READ_UNCONFIRMED')


def execute_read(reader,work,user,password,sql,runtime=False):
    if user not in (reader.USER,RUNTIME_USER) or not re.fullmatch('[0-9a-f]{64}',password):stop('SQL_CREDENTIAL_FORMAT_REJECTED')
    if (user==RUNTIME_USER)!=runtime:stop('SQL_USER_MODE_MISMATCH')
    socket_dir=str(work/reader.CONNECTION);pgpass=work/'runtime-verify.pgpass'
    with pgpass.open('x') as stream:
        os.chmod(pgpass,0o600)
        stream.write(socket_dir.replace('\\','\\\\').replace(':','\\:')+':5432:khedmah:'+user+':'+password+'\n')
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','CSQL_PROXY_','GOOGLE_'))}
    env.update(PGPASSFILE=str(pgpass),PGCONNECT_TIMEOUT='10',PGSSLMODE='disable',
        PGOPTIONS='-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000')
    try:
        result=subprocess.run(['psql','-X','-w','-q','-A','-t','-h',socket_dir,'-p','5432','-U',user,
            '-d',reader.DATABASE,'-v','ON_ERROR_STOP=1','-P','pager=off'],input=sql,text=True,capture_output=True,timeout=300,env=env)
    except (OSError,subprocess.TimeoutExpired):stop('RUNTIME_READ_UNCONFIRMED_NO_MUTATION')
    finally:pgpass.unlink(missing_ok=True)
    if result.returncode or len(result.stdout)>4096:stop('RUNTIME_READ_FAILED_NO_MUTATION')
    try:value=json.loads(result.stdout)
    except ValueError:stop('RUNTIME_READ_RESPONSE_INVALID')
    expected=dict(database='khedmah',user=user,session_user=user,read_only='on',table_count=64,routine_count=9,trigger_count=12)
    if runtime:expected.update(acl_exact=True,allowed_select_probes=62,denied_select_probes=2)
    elif isinstance(value,dict) and value.get('acl_state') in ('GRANTS_NOT_APPLIED','EXPECTED_GRANTS_PRESENT'):
        expected['acl_state']=value['acl_state']
    else:stop('RUNTIME_ACL_STATE_INVALID')
    if value!=expected:stop('RUNTIME_READ_RESPONSE_MISMATCH')
    return value


def inspect_runtime(verify_runtime=False):
    if not all(shutil.which(c) for c in ('gh','gcloud','psql','cloud-sql-proxy')):
        stop('GH_GCLOUD_PSQL_AND_PROXY_REQUIRED')
    with tempfile.TemporaryDirectory(prefix='pv2-',dir='/tmp') as directory:
        work=Path(directory);os.chmod(work,0o700)
        grants,acl,reader,food,authority,args,sql034=load_sources(work)
        grants.validate_manifest(food,authority,args)
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
                verify_structure(grants,reader,args,reader.read_catalog(work,password))
                state=execute_read(reader,work,reader.USER,password,state_sql(grants,acl))['acl_state']
                if verify_runtime:
                    if state!='EXPECTED_GRANTS_PRESENT':stop('RUNTIME_GRANTS_NOT_APPLIED_NO_RUNTIME_SECRET_READ')
                    resource='projects/'+reader.NUMBER+'/secrets/'+RUNTIME_SECRET+'/versions/1'
                    version=reader.cloud('secrets','versions','describe','1','--secret='+RUNTIME_SECRET,fields='name,state')
                    if version!={'name':resource,'state':'ENABLED'}:stop('RUNTIME_SECRET_VERSION_ONE_NOT_VERIFIED')
                    runtime_password=read_runtime_password(reader,token)
                    execute_read(reader,work,RUNTIME_USER,runtime_password,runtime_sql(grants,acl),runtime=True)
                    # Recheck using migrator after the runtime session: the exact
                    # ACLs must still match; there is no automatic repair/retry.
                    if execute_read(reader,work,reader.USER,password,state_sql(grants,acl))['acl_state']!=state:
                        stop('RUNTIME_ACL_CHANGED_DURING_VERIFICATION')
        finally:reader.stop_proxy(proxy)
        print(json.dumps(dict(stage='PREVIEW_V2_RUNTIME_LOGIN_READONLY_VERIFIED' if verify_runtime else 'PREVIEW_V2_RUNTIME_ACL_STATE_READ',
            project=reader.PROJECT,instance=reader.INSTANCE,database=reader.DATABASE,source_commit=SOURCE_COMMIT,
            acl_state=state,table_count=64,routine_count=9,trigger_count=12,
            expected_table_set_and_ownership_verified=True,exact_acl_state_verified=True,
            runtime_credential_access=verify_runtime,runtime_login_verified=verify_runtime,
            runtime_allowed_select_probes=62 if verify_runtime else 0,runtime_denied_select_probes=2 if verify_runtime else 0,
            runtime_dml_tested=False,full_schema_contract_reverified=False,
            secret_payload_access=True,migration_secret_version='1',runtime_secret_version='1' if verify_runtime else None,
            credential_values_printed=False,application_data_rows_read=False,application_data_rows_printed=False,
            schema_mutation=False,runtime_grants_mutation=False,cloud_resource_configuration_mutation=False,
            prior_attempt_commit_or_rollback_proven=False,retry_authorized=False,
            full_schema_ready=False,deployment_readiness_verified=False,taxi_trips_enabled=False,
            application_deployed=False,floot_connected=False,evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),sort_keys=True))


if __name__=='__main__':
    if sys.argv[1:] not in (['--inspect-acl'],['--verify-runtime']):stop('USE_INSPECT_ACL_OR_VERIFY_RUNTIME_ONLY')
    os.umask(0o077)
    try:inspect_runtime(verify_runtime=sys.argv[1]=='--verify-runtime')
    except (OSError,ValueError,TypeError,KeyError,AttributeError,EOFError,subprocess.SubprocessError,KeyboardInterrupt):
        stop('RUNTIME_READ_FAILURE_NO_MUTATION')
