#!/usr/bin/env python3
"""Read-only Preview successor gate inspection; never deploy or mutate the database."""
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
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
KNOWN_REVISION = SERVICE + "-00008-tg8"
INSTANCE = "khedmah-preview-v2-db"
CONNECTION = PROJECT + ":" + REGION + ":" + INSTANCE
DATABASE = "khedmah"
RUNTIME_DB_USER = "khedmah_app"
MIGRATOR_DB_USER = "khedmah_migrator"
DEPLOYER = "khedmah-pv2-deployer@" + PROJECT + ".iam.gserviceaccount.com"
RUNTIME_SA = "khedmah-pv2-runtime@" + PROJECT + ".iam.gserviceaccount.com"
AR_REPOSITORY = "khedmah-preview"
CANDIDATE_IMAGE = ("europe-west1-docker.pkg.dev/khedmah-preview-v2-20261012/"
                   "khedmah-preview/backend@sha256:"
                   "2146d382d426568a510b6e76ff06129934e84beb86bc81c348454fe3e29e260e")
CANDIDATE_BUILD_ID = "8b1b7aee-67f3-4721-ae76-f4bb60b4dc5e"
SOURCE_GENERATION = "1792786650146421"
REPO = "khedma-sy/khedmah-digital-v1"
READER_BLOB = "1f1565473cc1ab8d8e98791f0fc4af440f9d3d32"
READER_SHA256 = "154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11"
MAX_JSON = 4 * 1024 * 1024
SERVICE_NAME = f"projects/{PROJECT}/locations/{REGION}/services/{SERVICE}"
SERVICE_URL = "https://run.googleapis.com/v2/" + SERVICE_NAME
REVISIONS_URL = SERVICE_URL + "/revisions?pageSize=100"
TROUBLESHOOT_URL = "https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot"
# run.operations.get applies to an operation resource, not a service. This
# syntactically valid probe name exercises inherited/conditional IAM without
# creating an operation; Policy Troubleshooter remains fail-closed if Google
# cannot evaluate the tuple.
OPERATION_PROBE_RESOURCE = (
    f"//run.googleapis.com/projects/{PROJECT}/locations/{REGION}/operations/authority-preflight")

AUTHORITY_CHECKS = (
    ("run_services_get",
     f"//run.googleapis.com/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}",
     "run.services.get"),
    ("run_services_update",
     f"//run.googleapis.com/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}",
     "run.services.update"),
    ("run_revisions_list",
     f"//run.googleapis.com/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}",
     "run.revisions.list"),
    ("run_operations_get",
     OPERATION_PROBE_RESOURCE,
     "run.operations.get"),
    ("artifact_download",
     f"//artifactregistry.googleapis.com/projects/{PROJECT}/locations/{REGION}/repositories/{AR_REPOSITORY}",
     "artifactregistry.repositories.downloadArtifacts"),
    ("runtime_act_as",
     f"//iam.googleapis.com/projects/{PROJECT}/serviceAccounts/{RUNTIME_SA}",
     "iam.serviceAccounts.actAs"),
    ("service_usage",
     f"//cloudresourcemanager.googleapis.com/projects/{PROJECT}",
     "serviceusage.services.use"),
)

SESSION_SQL = r"""
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
SELECT json_build_object(
  'database', current_database(),
  'user', current_user,
  'read_only', current_setting('transaction_read_only'),
  'server_version_num', current_setting('server_version_num')::integer,
  'pg_read_all_stats_member', pg_has_role(current_user,'pg_read_all_stats','MEMBER'),
  'runtime_sessions_total', count(*) FILTER (
    WHERE usename='khedmah_app'),
  'runtime_sessions_active', CASE
    WHEN pg_has_role(current_user,'pg_read_all_stats','MEMBER')
    THEN count(*) FILTER (WHERE usename='khedmah_app' AND state='active')
    ELSE NULL END,
  'runtime_sessions_idle_in_transaction', CASE
    WHEN pg_has_role(current_user,'pg_read_all_stats','MEMBER')
    THEN count(*) FILTER (WHERE usename='khedmah_app'
      AND state IN ('idle in transaction','idle in transaction (aborted)'))
    ELSE NULL END,
  'migrator_sessions_other', count(*) FILTER (
    WHERE usename='khedmah_migrator' AND pid<>pg_backend_pid()),
  'other_sessions_by_identity', count(*) FILTER (
    WHERE usename IS NOT NULL
      AND usename NOT IN ('khedmah_app','khedmah_migrator','cloudsqladmin'))
) FROM pg_stat_activity WHERE datname=current_database();
ROLLBACK;
"""

def stop(code):
    raise SystemExit("STOP: " + code)

def require(ok, code):
    if not ok:
        stop(code)

def git_blob_hash(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def gh_blob():
    env = {k: v for k, v in os.environ.items() if k not in ("GH_DEBUG", "DEBUG")}
    try:
        result = subprocess.run(
            ["gh", "api", "--hostname", "github.com", "--method", "GET",
             "repos/" + REPO + "/git/blobs/" + READER_BLOB],
            capture_output=True, timeout=60, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop("PINNED_READER_UNAVAILABLE")
    require(result.returncode == 0 and len(result.stdout) <= 524288, "PINNED_READER_UNAVAILABLE")
    try:
        value = json.loads(result.stdout)
        raw = base64.b64decode("".join(value["content"].split()), validate=True)
    except (ValueError, KeyError, TypeError, AttributeError):
        stop("PINNED_READER_INVALID")
    require(value.get("sha") == READER_BLOB and value.get("encoding") == "base64"
            and value.get("size") == len(raw)
            and git_blob_hash(raw) == READER_BLOB
            and hashlib.sha256(raw).hexdigest() == READER_SHA256,
            "PINNED_READER_BYTES_MISMATCH")
    return raw

def load_reader(work):
    data = gh_blob()
    path = work / "reader.py"
    with path.open("xb") as stream:
        os.chmod(path, 0o600)
        stream.write(data)
    spec = importlib.util.spec_from_file_location("successor_gate_reader", path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    require((reader.PROJECT, reader.NUMBER, reader.ACCOUNT, reader.REGION,
             reader.CONNECTION, reader.DATABASE, reader.USER)
            == (PROJECT, NUMBER, ACCOUNT, REGION, CONNECTION, DATABASE, MIGRATOR_DB_USER),
            "PINNED_READER_IDENTITY_MISMATCH")
    return reader

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def http_json(token, method, url, body=None, optional=False):
    allowed = {( "GET", SERVICE_URL), ("GET", REVISIONS_URL), ("POST", TROUBLESHOOT_URL)}
    require((method, url) in allowed, "HTTP_READ_SCOPE_REJECTED")
    data = None if body is None else json.dumps(body, sort_keys=True).encode()
    if url == TROUBLESHOOT_URL:
        require(method == "POST" and isinstance(body, dict)
                and set(body) == {"accessTuple"}
                and isinstance(body["accessTuple"], dict)
                and set(body["accessTuple"]) == {"principal", "fullResourceName", "permission"}
                and body["accessTuple"]["principal"] == DEPLOYER
                and any((body["accessTuple"]["fullResourceName"], body["accessTuple"]["permission"])
                        == (resource, permission) for _, resource, permission in AUTHORITY_CHECKS),
                "AUTHORITY_REQUEST_SCOPE_REJECTED")
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + token,
        "x-goog-user-project": PROJECT,
        "Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=45) as response:
            raw = response.read(MAX_JSON + 1)
    except urllib.error.HTTPError as error:
        if optional:
            return {"_read_status": "http_" + str(error.code)}
        stop("HTTP_READ_" + str(error.code))
    except (OSError, ValueError):
        if optional:
            return {"_read_status": "unavailable"}
        stop("HTTP_READ_UNAVAILABLE")
    require(len(raw) <= MAX_JSON, "HTTP_RESPONSE_TOO_LARGE")
    try:
        value = json.loads(raw)
    except (ValueError, TypeError):
        stop("HTTP_RESPONSE_INVALID")
    require(isinstance(value, dict), "HTTP_RESPONSE_INVALID")
    return value

def short_revision(name):
    prefix = f"projects/{PROJECT}/locations/{REGION}/services/{SERVICE}/revisions/"
    require(isinstance(name, str), "REVISION_NAME_INVALID")
    short = name[len(prefix):] if name.startswith(prefix) else name
    require(re.fullmatch(re.escape(SERVICE) + r"-[a-z0-9]+(?:-[a-z0-9]+)*", short) is not None,
            "REVISION_NAME_INVALID")
    return short

def safe_scaling(value, service=False):
    if value is None:
        return {}
    require(isinstance(value, dict), "SCALING_METADATA_INVALID")
    allowed = ({"minInstanceCount", "maxInstanceCount", "scalingMode", "manualInstanceCount"}
               if service else {"minInstanceCount", "maxInstanceCount",
                                "cpuUtilization", "concurrencyUtilization"})
    require(not (set(value) - allowed), "SCALING_METADATA_INVALID")
    result = {}
    for key, item in value.items():
        require(type(item) in (int, float, str), "SCALING_METADATA_INVALID")
        result[key] = item
    return result

def service_summary(value):
    require(value.get("name") == SERVICE_NAME and value.get("uid")
            and value.get("generation") and value.get("observedGeneration")
            and str(value["generation"]) == str(value["observedGeneration"])
            and value.get("reconciling", False) is False, "SERVICE_STATE_INVALID")
    terminal = value.get("terminalCondition", {})
    require(isinstance(terminal, dict) and terminal.get("state") == "CONDITION_SUCCEEDED",
            "SERVICE_NOT_STABLE")
    latest_ready = short_revision(value.get("latestReadyRevision"))
    latest_created = short_revision(value.get("latestCreatedRevision"))
    statuses = value.get("trafficStatuses")
    require(isinstance(statuses, list) and 1 <= len(statuses) <= 50, "TRAFFIC_STATUS_INVALID")
    targets, total = [], 0
    for row in statuses:
        require(isinstance(row, dict), "TRAFFIC_STATUS_INVALID")
        revision = short_revision(row.get("revision"))
        percent = row.get("percent", 0)
        tag = row.get("tag")
        require(type(percent) is int and 0 <= percent <= 100
                and (tag is None or isinstance(tag, str)
                     and re.fullmatch(r"[a-z][a-z0-9-]{0,62}", tag)),
                "TRAFFIC_STATUS_INVALID")
        total += percent
        targets.append({"revision": revision, "percent": percent, "tagged": tag is not None,
                        "tag": tag})
    require(total == 100, "TRAFFIC_PERCENT_INVALID")
    template = value.get("template", {})
    containers = template.get("containers", []) if isinstance(template, dict) else []
    require(isinstance(containers, list) and len(containers) == 1 and isinstance(containers[0], dict)
            and isinstance(containers[0].get("image"), str), "SERVICE_TEMPLATE_INVALID")
    return {
        "latest_ready_revision": latest_ready,
        "latest_created_revision": latest_created,
        "known_revision_still_latest_ready": latest_ready == KNOWN_REVISION,
        "template_uses_candidate_image": containers[0]["image"] == CANDIDATE_IMAGE,
        "runtime_service_account_matches": template.get("serviceAccount") == RUNTIME_SA,
        "service_scaling": safe_scaling(value.get("scaling"), service=True),
        "traffic": targets,
        "tagged_revision_count": sum(1 for row in targets if row["tagged"]),
        "serving_revision_count": len({row["revision"] for row in targets if row["percent"] > 0}),
    }

def revisions_summary(value):
    rows = value.get("revisions", [])
    require(isinstance(rows, list) and 1 <= len(rows) <= 100 and not value.get("nextPageToken"),
            "REVISION_LIST_INCOMPLETE_OR_INVALID")
    out = []
    for row in rows:
        require(isinstance(row, dict), "REVISION_METADATA_INVALID")
        name = short_revision(row.get("name"))
        service = row.get("service")
        require(service is None or service == SERVICE_NAME, "REVISION_METADATA_INVALID")
        condition = row.get("conditions", [])
        require(isinstance(condition, list) and len(condition) <= 50, "REVISION_METADATA_INVALID")
        ready = any(isinstance(c, dict) and c.get("type") == "Ready"
                    and c.get("state") == "CONDITION_SUCCEEDED" for c in condition)
        out.append({"revision": name, "ready": ready,
                    "service_field_present": service is not None,
                    "scaling": safe_scaling(row.get("scaling"), service=False)})
    require(len({row["revision"] for row in out}) == len(out), "REVISION_LIST_DUPLICATE")
    return out

def authority_summary(token):
    results = {}
    for label, resource, permission in AUTHORITY_CHECKS:
        value = http_json(token, "POST", TROUBLESHOOT_URL, {
            "accessTuple": {"principal": DEPLOYER, "fullResourceName": resource,
                            "permission": permission}}, optional=True)
        if "_read_status" in value:
            results[label] = {"status": value["_read_status"], "access": None}
            continue
        access = value.get("overallAccessState")
        require(access in ("CAN_ACCESS", "CANNOT_ACCESS", "UNKNOWN_CONDITIONAL",
                           "UNKNOWN_INFO", "OVERALL_ACCESS_STATE_UNSPECIFIED"),
                "AUTHORITY_RESPONSE_INVALID")
        results[label] = {"status": "read", "access": access}
    return {
        "checks": results,
        "all_granted": all(row["access"] == "CAN_ACCESS" for row in results.values()),
        "policy_troubleshooter_complete": all(row["status"] == "read" for row in results.values()),
    }

def read_sessions(reader, work, password):
    require(isinstance(password, str) and re.fullmatch(r"[0-9a-f]{64}", password),
            "PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / CONNECTION)
    pgpass = work / "sessions.pgpass"
    with pgpass.open("x") as stream:
        os.chmod(pgpass, 0o600)
        stream.write(socket_dir.replace("\\", "\\\\").replace(":", "\\:")
                     + ":5432:" + DATABASE + ":" + MIGRATOR_DB_USER + ":" + password + "\n")
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("PG", "CSQL_PROXY_", "GOOGLE_"))}
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
               PGOPTIONS="-c role=none -c search_path=pg_catalog "
                         "-c default_transaction_read_only=on -c statement_timeout=20000")
    try:
        result = subprocess.run(
            ["psql", "-X", "-w", "-q", "-A", "-t", "-h", socket_dir, "-p", "5432",
             "-U", MIGRATOR_DB_USER, "-d", DATABASE, "-v", "ON_ERROR_STOP=1",
             "-P", "pager=off"],
            input=SESSION_SQL, text=True, capture_output=True, timeout=45, env=env)
    finally:
        pgpass.unlink(missing_ok=True)
    require(result.returncode == 0 and len(result.stdout) <= 16384, "SESSION_READ_FAILED")
    try:
        value = json.loads(result.stdout)
    except ValueError:
        stop("SESSION_RESPONSE_INVALID")
    expected = {"database", "user", "read_only", "server_version_num", "pg_read_all_stats_member",
                "runtime_sessions_total", "runtime_sessions_active",
                "runtime_sessions_idle_in_transaction", "migrator_sessions_other",
                "other_sessions_by_identity"}
    require(isinstance(value, dict) and set(value) == expected
            and value["database"] == DATABASE and value["user"] == MIGRATOR_DB_USER
            and value["read_only"] == "on"
            and type(value["server_version_num"]) is int
            and 160000 <= value["server_version_num"] < 170000
            and type(value["pg_read_all_stats_member"]) is bool,
            "SESSION_RESPONSE_INVALID")
    count_keys = {"runtime_sessions_total", "migrator_sessions_other",
                  "other_sessions_by_identity"}
    for key in count_keys:
        require(type(value[key]) is int and 0 <= value[key] <= 10000, "SESSION_RESPONSE_INVALID")
    detail_keys = ("runtime_sessions_active", "runtime_sessions_idle_in_transaction")
    if value["pg_read_all_stats_member"]:
        require(all(type(value[key]) is int and 0 <= value[key] <= 10000 for key in detail_keys),
                "SESSION_RESPONSE_INVALID")
        value["runtime_activity_detail_available"] = True
    else:
        require(all(value[key] is None for key in detail_keys), "SESSION_RESPONSE_INVALID")
        value["runtime_activity_detail_available"] = False
    value["runtime_sessions_zero_snapshot"] = value["runtime_sessions_total"] == 0
    value["writer_quiescence_verified"] = False
    return value

def inspect():
    require(sys.argv[1:] == ["--inspect"], "USE_INSPECT_ONLY")
    require(all(shutil.which(name) for name in ("gh", "gcloud", "psql", "cloud-sql-proxy")),
            "REQUIRED_TOOLS_MISSING")
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="pv2sg-", dir="/tmp") as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader = load_reader(work)
        reader.preflight()
        reader.validate_instance(reader.cloud(
            "sql", "instances", "describe", INSTANCE,
            fields="name,project,region,connectionName,state,databaseVersion"))
        token = reader.cloud("auth", "print-access-token").decode("ascii").strip()
        require(token and not any(c.isspace() for c in token), "TOKEN_UNAVAILABLE")
        service = service_summary(http_json(token, "GET", SERVICE_URL))
        revisions = revisions_summary(http_json(token, "GET", REVISIONS_URL))
        authority = authority_summary(token)
        password = reader.read_password(token)
        proxy = None
        socket = work / CONNECTION / ".s.PGSQL.5432"
        require(len(str(socket).encode()) < 104, "PRIVATE_SOCKET_PATH_TOO_LONG")
        try:
            with (work / "proxy.log").open("x") as log:
                os.chmod(work / "proxy.log", 0o600)
                proxy = subprocess.Popen(
                    ["cloud-sql-proxy", CONNECTION, "--unix-socket=" + str(work)],
                    stdout=log, stderr=subprocess.STDOUT,
                    env=reader.proxy_environment(token))
                deadline = time.monotonic() + 45
                while not socket.exists():
                    if proxy.poll() is not None or time.monotonic() >= deadline:
                        stop("PRIVATE_SQL_PROXY_NOT_READY")
                    time.sleep(0.25)
                require(proxy.poll() is None and stat.S_ISSOCK(socket.stat().st_mode),
                        "PRIVATE_SQL_PROXY_SOCKET_INVALID")
                sessions = read_sessions(reader, work, password)
        finally:
            reader.stop_proxy(proxy)
    receipt = {
        "stage": "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED",
        "evidence_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "project": PROJECT, "region": REGION, "service_name": SERVICE, "instance": INSTANCE,
        "candidate_build_id": CANDIDATE_BUILD_ID,
        "candidate_source_generation": SOURCE_GENERATION,
        "candidate_image_reference": CANDIDATE_IMAGE,
        "service_state": service, "revisions": revisions, "authority": authority,
        "database_activity": sessions,
        "secret_payload_access": True,
        "credential_values_printed": False,
        "application_data_rows_read": False,
        "cloud_resource_mutation": False,
        "schema_mutation": False,
        "role_mutation": False,
        "application_data_mutation": False,
        "application_deployment_performed": False,
        "traffic_mutation": False,
        "scaling_mutation": False,
        "writer_quiescence_verified": False,
        "release_gates_verified": False,
        "production_readiness_verified": False,
    }
    print(json.dumps(receipt, sort_keys=True))

if __name__ == "__main__":
    try:
        inspect()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, UnicodeError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop("LOCAL_OR_SUCCESSOR_READ_FAILURE")
