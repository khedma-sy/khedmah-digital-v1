#!/usr/bin/env python3
"""Read-only exact schema-035 contract check for the deployed Preview V2 backend."""
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

REPO = 'khedma-sy/khedmah-digital-v1'
OLD_BLOB = 'b677aa499574e4194b107806dba48b88c85b6142'
READER_BLOB = '1f1565473cc1ab8d8e98791f0fc4af440f9d3d32'
READER_SHA256 = '154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11'

def stop(code):
    raise SystemExit('STOP: ' + code)

def source_blob(blob):
    import base64
    import hashlib
    env = {k:v for k,v in os.environ.items() if k not in ('GH_DEBUG','DEBUG')}
    r = subprocess.run(['gh','api','--hostname','github.com',
        'repos/'+REPO+'/git/blobs/'+blob],capture_output=True,timeout=60,env=env)
    if r.returncode or len(r.stdout)>262144: stop('PINNED_BLOB_FETCH_FAILED')
    try:
        v=json.loads(r.stdout)
        if v['sha']!=blob or v['encoding']!='base64': stop('PINNED_BLOB_METADATA_INVALID')
        data=base64.b64decode(''.join(v['content'].split()),validate=True)
        if v['size']!=len(data) or hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=blob:
            stop('PINNED_BLOB_HASH_INVALID')
        return data
    except (ValueError,KeyError,TypeError): stop('PINNED_BLOB_INVALID')

def contract(source):
    s=source.decode('utf-8')
    if s.count("REQUIRED_CANONICAL_SCHEMA_VERSION = '035'")!=1:
        stop('OLD_SCHEMA_VERSION_MISMATCH')
    a=s.index('export const CANONICAL_SCHEMA_ANCHORS:')
    b=s.index('interface CatalogRow',a)
    anchors=s[a:b]
    pattern=r"(table|column|constraint|index|fn)\('([^']+)',\s*'([0-9]+)',\s*'([^']+)'(?:,\s*'([^']+)')?\)"
    result=[]
    for match in re.finditer(pattern,anchors):
        kind,domain,migration,table,name=match.groups()
        result.append((('function' if kind=='fn' else kind),table,name or table,domain,migration))
    spread=r"\.\.\.\[([^\]]+)\]\.map\(\(name\) => column\('([^']+)',\s*'([0-9]+)',\s*'([^']+)', name\)\)"
    for m in re.finditer(spread,anchors):
        names,domain,migration,table=m.groups()
        result.extend(('column',table,n,domain,migration) for n in re.findall(r"'([^']+)'",names))
    if not result or len(result)!=len(set(result)) or len(result)<100:
        stop('ANCHOR_PARSER_INCOMPLETE')
    stripped=re.sub(spread,'',anchors)
    stripped=re.sub(pattern,'',stripped)
    if '=> column(' in stripped or re.search(r"\b(?:table|column|constraint|index|fn)\(",stripped):
        stop('UNPARSED_SCHEMA_ANCHORS')
    start=s.index('const CATALOG_QUERY = `')+len('const CATALOG_QUERY = `')
    end=s.index('`;',start)
    query=s[start:end]
    if 'SELECT' not in query or 'UNION ALL' not in query or '${' in query:
        stop('CATALOG_QUERY_INVALID')
    return result,query

def build_sql(query):
    return """BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $identity$
BEGIN
 IF current_database()<>'khedmah' OR current_user<>'khedmah_migrator'
 OR session_user<>'khedmah_migrator' OR current_setting('transaction_read_only')<>'on'
 OR current_setting('transaction_isolation')<>'repeatable read' THEN
 RAISE EXCEPTION 'SCHEMA_035_IDENTITY_MISMATCH';
 END IF;
END $identity$;
""" + """SELECT pg_catalog.json_build_object(
 'database',current_database(),'user',current_user,
 'read_only',current_setting('transaction_read_only'),
 'isolation',current_setting('transaction_isolation'),
 'anchors',coalesce(pg_catalog.json_agg(pg_catalog.json_build_array(kind,table_name,name)), '[]'::json))
FROM (""" + query + """) catalog;
ROLLBACK;
"""

def read_035_catalog(reader,work,password,sql):
    import stat
    if not re.fullmatch(r'[0-9a-f]{64}',password): stop('PASSWORD_FORMAT_INVALID')
    socket_dir=str(work/reader.CONNECTION)
    pgpass=work/'pgpass'
    with pgpass.open('x') as stream:
        os.chmod(pgpass,0o600)
        host=socket_dir.replace(chr(92),chr(92)*2).replace(':',chr(92)+':')
        stream.write(host+':5432:'+reader.DATABASE+':'+reader.USER+':'+password+'\\n')
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','CSQL_PROXY_','GOOGLE_'))}
    env.update(PGPASSFILE=str(pgpass),PGCONNECT_TIMEOUT='10',PGSSLMODE='disable',
        PGOPTIONS='-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000')
    try:
        result=subprocess.run(['psql','-X','-w','-q','-A','-t','-h',socket_dir,'-p','5432',
            '-U',reader.USER,'-d',reader.DATABASE,'-v','ON_ERROR_STOP=1','-P','pager=off'],
            input=sql,text=True,capture_output=True,timeout=60,env=env)
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode or len(result.stdout)>262144: stop('SCHEMA_035_SQL_FAILED')
    try: return json.loads(result.stdout)
    except ValueError: stop('SCHEMA_035_SQL_RESPONSE_INVALID')

def main():
    if sys.argv[1:]!=['--inspect']: stop('USE_INSPECT_ONLY')
    os.umask(0o077)
    anchors,query=contract(source_blob(OLD_BLOB))
    import hashlib
    reader_data=source_blob(READER_BLOB)
    if hashlib.sha256(reader_data).hexdigest()!=READER_SHA256:
        stop('TRANSPORT_HASH_INVALID')
    with tempfile.TemporaryDirectory(prefix='pv2-035-',dir='/tmp') as d:
        work=Path(d)
        path=work/'reader.py'
        path.write_bytes(reader_data)
        path.chmod(0o600)
        spec=importlib.util.spec_from_file_location('pinned_schema_035_reader',path)
        reader=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        reader.preflight()
        if not reader.shutil.which('psql') or not reader.shutil.which('cloud-sql-proxy'):
            stop('PSQL_PROXY_REQUIRED')
        reader.validate_instance(reader.cloud('sql','instances','describe',reader.INSTANCE,
            fields='name,project,region,connectionName,state,databaseVersion'))
        version=reader.cloud('secrets','versions','describe','1','--secret='+reader.SECRET,fields='name,state')
        if version!={'name':reader.RESOURCE,'state':'ENABLED'}:
            stop('MIGRATION_SECRET_VERSION_MISMATCH')
        token=reader.cloud('auth','print-access-token').decode('ascii').strip()
        if not token or any(x.isspace() for x in token): stop('TOKEN_INVALID')
        password=reader.read_password(token)
        proxy=None
        try:
            import time
            import stat
            socket=work/reader.CONNECTION/'.s.PGSQL.5432'
            if len(str(socket).encode())>=104: stop('SOCKET_PATH_TOO_LONG')
            with (work/'proxy.log').open('x') as log:
                proxy=subprocess.Popen(['cloud-sql-proxy',reader.CONNECTION,'--unix-socket='+str(work)],
                    stdout=log,stderr=subprocess.STDOUT,env=reader.proxy_environment(token))
                deadline=time.monotonic()+45
                while time.monotonic()<deadline and not socket.exists() and proxy.poll() is None:
                    time.sleep(0.2)
                if not socket.exists() or not stat.S_ISSOCK(socket.stat().st_mode):
                    stop('PRIVATE_PROXY_SOCKET_NOT_READY')
                result=read_035_catalog(reader,work,password,build_sql(query))
        finally:
            if proxy is not None: reader.stop_proxy(proxy)
    if not isinstance(result,dict) or result.get('database')!='khedmah' or result.get('user')!='khedmah_migrator' or result.get('read_only')!='on' or result.get('isolation')!='repeatable read':
        stop('CATALOG_IDENTITY_INVALID')
    rows=result.get('anchors')
    if not isinstance(rows,list) or len(rows)>10000 or any(not isinstance(x,list) or len(x)!=3 or any(not isinstance(y,str) for y in x) for x in rows):
        stop('CATALOG_ROWS_INVALID')
    present={tuple(x) for x in rows}
    missing=[dict(kind=k,table=t,name=n,domain=d,migration=m) for k,t,n,d,m in anchors if (k,t,n) not in present]
    print(json.dumps(dict(stage='PREVIEW_V2_OLD_RUNTIME_SCHEMA_035_READONLY',
        source_blob=OLD_BLOB,expected=len(anchors),missing_count=len(missing),
        missing=missing,compatible=not missing,read_only=True,
        schema_mutation=False,cloud_resource_mutation=False,
        release_gates_verified=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),sort_keys=True))
    if missing: stop('SCHEMA_035_INCOMPATIBLE')

if __name__=='__main__':
    try: main()
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):
        stop('SCHEMA_035_READ_UNCONFIRMED')
