#!/usr/bin/env python3
"""Read only Preview database catalogs using the existing migration credential."""
import base64
import datetime
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

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
REGION = "europe-west1"
INSTANCE = "khedmah-preview-v2-db"
CONNECTION = PROJECT + ":" + REGION + ":" + INSTANCE
DATABASE = "khedmah"
USER = "khedmah_migrator"
SECRET = "DATABASE_MIGRATION_URL"
RESOURCE = "projects/" + NUMBER + "/secrets/" + SECRET + "/versions/1"
ACCESS_URL = "https://secretmanager.googleapis.com/v1/" + RESOURCE + ":access"
ROLES = ("khedmah_app", "khedmah_migrator", "khedmah_runtime_role", "khedmah_migration_role")

CATALOG_SQL = """
BEGIN READ ONLY;
SELECT json_build_object(
 'database', current_database(), 'user', current_user,
 'read_only', current_setting('transaction_read_only'),
 'server_version_num', current_setting('server_version_num')::integer,
 'roles', (SELECT coalesce(json_agg(json_build_object(
   'name', rolname, 'login', rolcanlogin, 'super', rolsuper,
   'createdb', rolcreatedb, 'createrole', rolcreaterole,
   'replication', rolreplication, 'bypassrls', rolbypassrls) ORDER BY rolname), '[]'::json)
   FROM pg_roles WHERE rolname IN
   ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')),
 'memberships', (SELECT coalesce(json_agg(json_build_object(
   'member', u.rolname, 'role', r.rolname, 'admin', m.admin_option,
   'inherit', m.inherit_option, 'set', m.set_option) ORDER BY u.rolname,r.rolname), '[]'::json)
   FROM pg_auth_members m JOIN pg_roles u ON u.oid=m.member JOIN pg_roles r ON r.oid=m.roleid
   WHERE u.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')),
 'database_privileges', (SELECT json_agg(json_build_object(
   'role', rolname, 'connect', has_database_privilege(oid,current_database(),'CONNECT'),
   'create', has_database_privilege(oid,current_database(),'CREATE'),
   'temp', has_database_privilege(oid,current_database(),'TEMP'),
   'public_usage', has_schema_privilege(oid,'public','USAGE'),
   'public_create', has_schema_privilege(oid,'public','CREATE')) ORDER BY rolname)
   FROM pg_roles WHERE rolname IN ('khedmah_app','khedmah_migrator')),
 'schemas', (SELECT coalesce(json_agg(json_build_object(
   'name', nspname, 'owner', pg_get_userbyid(nspowner)) ORDER BY nspname), '[]'::json)
   FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'),
 'relation_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND c.relkind IN ('r','p','v','m','S','f')),
 'relations', (SELECT coalesce(json_agg(json_build_object(
   'schema', nspname, 'name', relname, 'kind', relkind, 'owner', pg_get_userbyid(relowner),
   'runtime_select', CASE WHEN relkind <> 'S' THEN has_table_privilege('khedmah_app',oid,'SELECT') END,
   'runtime_insert', CASE WHEN relkind <> 'S' THEN has_table_privilege('khedmah_app',oid,'INSERT') END,
   'runtime_update', CASE WHEN relkind <> 'S' THEN has_table_privilege('khedmah_app',oid,'UPDATE') END,
   'runtime_delete', CASE WHEN relkind <> 'S' THEN has_table_privilege('khedmah_app',oid,'DELETE') END,
   'runtime_sequence_usage', CASE WHEN relkind = 'S' THEN has_sequence_privilege('khedmah_app',oid,'USAGE') END)
   ORDER BY nspname,relname), '[]'::json)
   FROM (SELECT c.oid,c.relname,c.relkind,c.relowner,n.nspname
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
       AND c.relkind IN ('r','p','v','m','S','f')
     ORDER BY n.nspname,c.relname LIMIT 200) inventory),
 'routine_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),
 'default_acls', (SELECT coalesce(json_agg(json_build_object(
   'owner', pg_get_userbyid(d.defaclrole), 'schema', coalesce(n.nspname,'*'),
   'kind', d.defaclobjtype, 'acl', d.defaclacl::text)
   ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype), '[]'::json)
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
   JOIN pg_roles r ON r.oid=d.defaclrole
   WHERE r.rolname IN ('khedmah_migrator','khedmah_migration_role'))
);
ROLLBACK;
"""

def stop(code):
    raise SystemExit("STOP: " + code)


def cloud(*args, fields=None, data=None):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields is not None:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, input=data if data is not None else b"",
            capture_output=True, timeout=90, env=dict(os.environ,
                CLOUDSDK_CORE_DISABLE_PROMPTS="true", CLOUDSDK_CORE_LOG_HTTP="false",
                CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                CLOUDSDK_CORE_UNIVERSE_DOMAIN="googleapis.com",
                CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_OPERATION_UNCONFIRMED_RECONCILE_BEFORE_RETRY")
    # Never print command output/errors: a failed operation may contain payloads.
    if result.returncode:
        stop("GCLOUD_" + "_".join(args[:3]).upper().replace("-", "_") + "_FAILED_RECONCILE")
    if fields is None:
        return result.stdout
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop("INVALID_METADATA_RECONCILE")


def preflight():
    if any(os.environ.get(key) for key in (
            "CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
            "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE")):
        stop("AUTH_OVERRIDE_PRESENT")
    if any(key.startswith("CLOUDSDK_API_ENDPOINT_OVERRIDES_") and value
           for key, value in os.environ.items()):
        stop("API_ENDPOINT_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key).strip() not in (b"", b"(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    # Refuse configured endpoint overrides before obtaining an access token.
    endpoints = cloud("config", "list", "api_endpoint_overrides/", fields="api_endpoint_overrides")
    if not isinstance(endpoints, dict) or endpoints.get("api_endpoint_overrides"):
        stop("API_ENDPOINT_OVERRIDE_PRESENT_OR_UNCONFIRMED")
    accounts = cloud("auth", "list", "--filter=account=" + ACCOUNT, fields="account")
    if accounts != [{"account": ACCOUNT}]:
        stop("EXPECTED_ACCOUNT_NOT_AVAILABLE")
    project = cloud("projects", "describe", PROJECT,
                    fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": ORGANIZATION}):
        stop("PROJECT_IDENTITY_MISMATCH")




def validate_instance(value):
    if (not isinstance(value, dict) or value.get("name") != INSTANCE
            or value.get("project") != PROJECT or value.get("region") != REGION
            or value.get("connectionName") != CONNECTION or value.get("state") != "RUNNABLE"
            or value.get("databaseVersion") != "POSTGRES_16"):
        stop("SQL_INSTANCE_IDENTITY_MISMATCH")


def password_from_payload(value):
    if not isinstance(value, dict) or value.get("name") != RESOURCE:
        stop("SECRET_VERSION_IDENTITY_MISMATCH")
    try:
        payload = base64.b64decode(value["payload"]["data"], validate=True).decode("ascii")
    except (KeyError, TypeError, ValueError, UnicodeError):
        stop("SECRET_PAYLOAD_FORMAT_REJECTED")
    match = re.fullmatch(r"postgresql://khedmah_migrator:([0-9a-f]{64})@localhost/khedmah", payload)
    if not match:
        stop("SECRET_CONNECTION_TARGET_REJECTED")
    return match.group(1)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_password(token):
    request = urllib.request.Request(ACCESS_URL, method="GET",
        headers={"Authorization": "Bearer " + token, "x-goog-user-project": PROJECT})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
            raw = response.read(16385)
        if len(raw) > 16384:
            stop("SECRET_RESPONSE_TOO_LARGE")
        return password_from_payload(json.loads(raw))
    except urllib.error.HTTPError as error:
        stop("SECRET_ACCESS_HTTP_" + str(error.code))
    except (OSError, ValueError):
        stop("SECRET_ACCESS_UNCONFIRMED")


def proxy_environment(token):
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("CSQL_PROXY_", "GOOGLE_", "PG"))}
    env["CSQL_PROXY_TOKEN"] = token
    return env


def read_catalog(work, password):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / CONNECTION)
    pgpass = work / "pgpass"
    # Match the exact private socket directory; escape libpq passfile separators.
    with pgpass.open("x") as stream:
        os.chmod(pgpass, 0o600)
        host_field = socket_dir.replace("\\", "\\\\").replace(":", "\\:")
        stream.write(host_field + ":5432:" + DATABASE + ":" + USER + ":" + password + "\n")
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("PG", "CSQL_PROXY_", "GOOGLE_"))}
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
               PGOPTIONS="-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on "
                         "-c statement_timeout=30000 -c lock_timeout=5000")
    try:
        result = subprocess.run(["psql", "-X", "-w", "-q", "-A", "-t",
            "-h", socket_dir, "-p", "5432", "-U", USER, "-d", DATABASE,
            "-v", "ON_ERROR_STOP=1", "-P", "pager=off"], input=CATALOG_SQL,
            text=True, capture_output=True, timeout=60, env=env)
    finally:
        pgpass.unlink(missing_ok=True)
    if result.returncode:
        stop("CATALOG_SQL_READ_FAILED")
    if len(result.stdout) > 262144:
        stop("CATALOG_RESPONSE_TOO_LARGE")
    try:
        value = json.loads(result.stdout)
    except ValueError:
        stop("CATALOG_RESPONSE_INVALID")
    required = {"database", "user", "read_only", "server_version_num", "roles", "memberships",
                "database_privileges", "schemas", "relation_count", "relations", "routine_count", "default_acls"}
    if (not isinstance(value, dict) or set(value) != required or value["database"] != DATABASE
            or value["user"] != USER or value["read_only"] != "on"
            or type(value["server_version_num"]) is not int
            or not 160000 <= value["server_version_num"] < 170000):
        stop("CATALOG_IDENTITY_OR_READ_ONLY_MISMATCH")
    for name in ("roles", "memberships", "database_privileges", "schemas", "relations", "default_acls"):
        if not isinstance(value[name], list) or any(not isinstance(row, dict) for row in value[name]):
            stop("CATALOG_SHAPE_INVALID")
    if {row.get("name") for row in value["roles"]} != set(ROLES):
        stop("CATALOG_ROLE_INVENTORY_MISMATCH")
    for name in ("relation_count", "routine_count"):
        if type(value[name]) is not int or value[name] < 0:
            stop("CATALOG_COUNT_INVALID")
    if len(value["relations"]) != min(value["relation_count"], 200):
        stop("CATALOG_RELATION_COUNT_MISMATCH")
    value["relation_inventory_complete"] = value["relation_count"] <= 200
    return value


def stop_proxy(proxy):
    if proxy is not None and proxy.poll() is None:
        proxy.terminate()
        try:
            proxy.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proxy.kill()
            proxy.wait(timeout=10)


def inspect():
    preflight()
    if not shutil.which("psql") or not shutil.which("cloud-sql-proxy"):
        stop("PSQL_AND_PROXY_REQUIRED")
    validate_instance(cloud("sql", "instances", "describe", INSTANCE,
                            fields="name,project,region,connectionName,state,databaseVersion"))
    version = cloud("secrets", "versions", "describe", "1", "--secret=" + SECRET, fields="name,state")
    if version != {"name": RESOURCE, "state": "ENABLED"}:
        stop("MIGRATION_SECRET_VERSION_ONE_NOT_VERIFIED")
    token = cloud("auth", "print-access-token").decode("ascii").strip()
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    password = read_password(token)
    proxy = None
    # New private socket directory avoids existing proxy listeners and TCP fallback.
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        socket = work / CONNECTION / ".s.PGSQL.5432"
        if len(str(socket).encode()) >= 104:
            stop("PRIVATE_SOCKET_PATH_TOO_LONG")
        try:
            with (work / "proxy.log").open("x") as log:
                os.chmod(work / "proxy.log", 0o600)
                proxy = subprocess.Popen(["cloud-sql-proxy", CONNECTION, "--unix-socket=" + str(work)],
                    stdout=log, stderr=subprocess.STDOUT, env=proxy_environment(token))
                deadline = time.monotonic() + 45
                while not socket.exists():
                    if proxy.poll() is not None or time.monotonic() >= deadline:
                        stop("PRIVATE_SQL_PROXY_NOT_READY")
                    time.sleep(0.25)
                if proxy.poll() is not None or not stat.S_ISSOCK(socket.stat().st_mode):
                    stop("PRIVATE_SQL_PROXY_SOCKET_INVALID")
                catalog = read_catalog(work, password)
        finally:
            stop_proxy(proxy)
    print(json.dumps(dict(stage="PREVIEW_V2_SCHEMA_CATALOG_READ_COMPLETED",
        project=PROJECT, instance=INSTANCE, catalog=catalog,
        migration_secret_version="1", secret_payload_access=True, credential_values_printed=False,
        application_data_rows_read=False, cloud_resource_mutation=False, schema_mutation=False,
        runtime_grants_mutation=False, schema_readiness_verified=False, application_deployment_performed=False,
        floot_connection_tested=False, evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),
        sort_keys=True))


if __name__ == "__main__":
    if sys.argv[1:] != ["--inspect"]:
        stop("USE_INSPECT_ONLY")
    os.umask(0o077)
    try:
        inspect()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("LOCAL_OR_CATALOG_READ_FAILURE")
