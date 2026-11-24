#!/usr/bin/env python3
"""Lab-only 036+037 atomic schema transition. Never touches Preview/Production.

--plan validates pinned sources and lab preflight with read-only APIs.
--execute requires explicit confirmation, creates one temporary private job,
rotates the LAB migrator and postgres passwords, and cleans up job/SA/secrets
when safe. An uncertain fence retains recovery resources. A failure may leave
LAB passwords rotated. Never retry without inspecting current LAB resources.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LAB = "khedmah-restore-lab-20261112"
SQL = "khedmah-restore-pg16-20261114"
REGION = "europe-west1"
NET = "khedmah-restore-private"
SUB = "khedmah-restore-ew1"
MIGRATOR = "khedmah_migrator"
SA = "khedmah-lab-transition"
SQL_SECRET = "khedmah-lab-transition-sql"
PASSWORD_SECRET = "khedmah-lab-transition-password"
ADMIN_SECRET = "khedmah-lab-transition-admin"
FENCE_TEMPLATE = "scripts/deployment/lab-fenced-migration.sh"
FENCE_TEMPLATE_SHA256 = "94a68a12e1b9cf73d3567bd8ecd08c6195d37fdb1a90fc58b1076c1d2f918100"
JOB_PREFIX = "khedmah-lab-transition-"
CONFIRM = "APPLY_LAB_ONLY_036_037_AFTER_RESTORE"

# This rejects other sessions immediately before the lab transition. It is a
# snapshot guard, not a fence: new sessions can still connect afterward.
# Network isolation and a durable external-writer/session fence are separate
# prerequisites for any real execution.
LAB_SESSION_CHECK = """DO $lab_session_check$
BEGIN
  PERFORM pg_catalog.pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_catalog.pg_backend_pid()) THEN
    RAISE EXCEPTION 'LAB_OTHER_DATABASE_SESSION_PRESENT';
  END IF;
END $lab_session_check$;
"""

def import_file(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# This imports only locally SHA-pinned repository source; no network access.
catalog = import_file("scripts/run-recovery-lab-catalog-probe.py", "catalog_probe")
offline = import_file("scripts/prepare-preview-v2-approval-transition.py", "offline_transition")
GuardStop = catalog.GuardStop
call = catalog.call

def candidate_sql():
    # Strict hashes of canonical migrations 025/036/037 and source classifier,
    # including 035 target + 036 predecessor + 037 privacy constraints.
    source = {name: (ROOT / pin[0]).read_bytes()
              for name, pin in offline.SOURCE_PINS.items()}
    sql = offline.build_transition_sql(source)
    anchor = "SET LOCAL search_path=pg_catalog;\n"
    if sql.count(anchor) != 1:
        raise GuardStop("LAB_SESSION_CHECK_INSERTION_POINT_UNVERIFIED")
    sql = sql.replace(anchor, anchor + LAB_SESSION_CHECK, 1)
    selected = ("035", "036", "037_TYPE", "037_PRIVATE")
    postflight = []
    parts = catalog.CATALOG_SQL.split(";")
    for marker in selected:
        target = "SELECT 'LAB_PROBE_" + marker + "='"
        choices = [part.strip() for part in parts if part.strip().startswith(target)]
        if len(choices) != 1:
            raise GuardStop("CATALOG_POSTFLIGHT_SOURCE_MISMATCH")
        postflight.append(choices[0] + ";")
    # This is an immutable SQL transaction with guarded predecessor, exact
    # postcondition and metadata-preservation assertions BEFORE COMMIT.
    if (sql.count("BEGIN ISOLATION LEVEL READ COMMITTED, READ WRITE;") != 1
            or sql.count("COMMIT;") != 1
            or not sql.rstrip().endswith("COMMIT;")):
        raise GuardStop("TRANSITION_ATOMICITY_UNVERIFIED")
    return sql + "\n" + "\n".join(postflight) + "\n"


def fenced_payload(sql):
    """Build the lab-only entrypoint from a pinned template and canonical SQL."""
    try:
        data = (ROOT / FENCE_TEMPLATE).read_bytes()
        template = data.decode("utf-8")
    except (OSError, UnicodeError) as exc:
        raise GuardStop("LAB_FENCE_TEMPLATE_UNAVAILABLE") from exc
    if (hashlib.sha256(data).hexdigest() != FENCE_TEMPLATE_SHA256
            or template.count("__KHEDMA_CANONICAL_SQL__") != 1
            or not isinstance(sql, str) or "KHEDMA_LAB_PSQL" in sql
            or any(line.lstrip().startswith(chr(92)) for line in sql.splitlines())):
        raise GuardStop("LAB_FENCE_TEMPLATE_OR_SQL_UNVERIFIED")
    payload = template.replace("__KHEDMA_CANONICAL_SQL__", sql, 1)
    if len(payload.encode("utf-8")) > 65536:
        raise GuardStop("LAB_FENCE_PAYLOAD_TOO_LARGE")
    return payload

# This tests the caller's inherited *project-level* grants for new secrets.
# Google notes that testIamPermissions is advisory (and may fail open), so a
# positive result is NOT an authorization receipt or evidence of an org-policy
# allow. A missing permission or unavailable response must stop before secrets
# are created, without guessing or expanding IAM grants.
SECRET_IAM_PERMISSIONS = (
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
)

# IAM account creation is eventually consistent across services. Retry only a
# specific rejection identifying our just-created LAB principal; all other
# failures, including uncertain timeouts, stop before any SQL/job action.
SECRET_BIND_BACKOFF_SECONDS = (2, 4, 8, 16, 30, 30)


def _is_new_lab_principal_missing(stderr, email):
    if not isinstance(stderr, bytes) or len(stderr) > 262144:
        return False
    principal = re.escape(email)
    named = r'(?:\[' + principal + r'\]|"' + principal + r'"|\x27' + principal + r'\x27|' + principal + r')'
    pattern = (r'\s*ERROR:\s*\(gcloud\.secrets\.add-iam-policy-binding\)\s*'
               r'INVALID_ARGUMENT:\s*Service account\s+' + named +
               r'\s+does not exist\.?\s*')
    return any(re.fullmatch(pattern, line, re.IGNORECASE)
               for line in stderr.decode(errors="replace").splitlines())


def bind_temporary_secret_accessor(secret):
    if secret not in (SQL_SECRET, PASSWORD_SECRET, ADMIN_SECRET):
        raise GuardStop("LAB_SECRET_BINDING_TARGET_UNEXPECTED")
    email = SA + "@" + LAB + ".iam.gserviceaccount.com"
    command = ["gcloud", "--quiet", "--project=" + LAB,
               "secrets", "add-iam-policy-binding", secret,
               "--member=serviceAccount:" + email,
               "--role=roles/secretmanager.secretAccessor"]
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1",
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true")
    for attempt in range(len(SECRET_BIND_BACKOFF_SECONDS) + 1):
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=45, env=env)
        except (OSError, subprocess.TimeoutExpired) as exc:
            # The remote outcome is uncertain, so do not retry this write.
            raise GuardStop("LAB_SECRET_BINDING_OUTCOME_UNCERTAIN") from exc
        if result.returncode == 0:
            return
        if not _is_new_lab_principal_missing(result.stderr, email):
            raise GuardStop("LAB_SECRET_BINDING_FAILED")
        if attempt == len(SECRET_BIND_BACKOFF_SECONDS):
            raise GuardStop("LAB_SERVICE_ACCOUNT_NOT_VISIBLE_AFTER_RETRIES")
        print("LAB_SERVICE_ACCOUNT_PROPAGATION_RETRY", flush=True)
        delay = SECRET_BIND_BACKOFF_SECONDS[attempt] + secrets.randbelow(1000) / 1000
        time.sleep(delay)


def require_project_secret_iam_capability():
    command = ["gcloud", "--quiet", "--project=" + LAB,
               "auth", "print-access-token"]
    try:
        credential = subprocess.run(command, capture_output=True, timeout=35)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GuardStop("LAB_IAM_DIAGNOSTIC_UNAVAILABLE") from exc
    if credential.returncode or not credential.stdout.strip():
        raise GuardStop("LAB_IAM_DIAGNOSTIC_UNAVAILABLE")
    url = ("https://cloudresourcemanager.googleapis.com/v1/projects/"
           + LAB + ":testIamPermissions")
    request = urllib.request.Request(
        url,
        data=json.dumps({"permissions": list(SECRET_IAM_PERMISSIONS)}).encode(),
        headers={
            "Authorization": "Bearer " + credential.stdout.decode().strip(),
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.HTTPError) as exc:
        raise GuardStop("LAB_IAM_DIAGNOSTIC_UNAVAILABLE") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("permissions", []), list):
        raise GuardStop("LAB_IAM_DIAGNOSTIC_UNAVAILABLE")
    allowed = payload.get("permissions", [])
    if not set(SECRET_IAM_PERMISSIONS).issubset(allowed):
        raise GuardStop("LAB_SECRET_POLICY_WRITE_PERMISSION_NOT_REPORTED")
    print("LAB_SECRET_POLICY_PERMISSION_CHECK=ADVISORY_PRESENT", flush=True)


def guarded_preflight():
    host = catalog.preflight()  # pins 1 private SQL, VPC/PSA, firewall and DB
    services = call(["run", "services", "list", "--region=" + REGION],
                    output_json=True)
    if not isinstance(services, list) or services:
        raise GuardStop("LAB_SERVICES_EXIST_WRITERS_NOT_QUIESCENT")
    jobs = call(["run", "jobs", "list", "--region=" + REGION], output_json=True)
    if not isinstance(jobs, list) or jobs:
        raise GuardStop("LAB_JOBS_EXIST_REVIEW_BEFORE_MUTATION")
    accounts = call(["iam", "service-accounts", "list"], output_json=True)
    email = SA + "@" + LAB + ".iam.gserviceaccount.com"
    if not isinstance(accounts, list) or any(x.get("email") == email for x in accounts):
        raise GuardStop("LAB_TRANSITION_SA_EXISTS")
    secret_list = call(["secrets", "list"], output_json=True)
    if not isinstance(secret_list, list) or any(
            x.get("name", "").endswith("/" + secret)
            for x in secret_list for secret in (SQL_SECRET, PASSWORD_SECRET, ADMIN_SECRET)):
        raise GuardStop("LAB_TRANSITION_SECRET_EXISTS")
    users = call(["sql", "users", "list", "--instance=" + SQL], output_json=True)
    if not isinstance(users, list) or len([
            x for x in users if x.get("name") == MIGRATOR
            and x.get("type", "BUILT_IN") == "BUILT_IN"]) != 1:
        raise GuardStop("LAB_EXISTING_MIGRATOR_MISSING")
    require_project_secret_iam_capability()
    return host

def cleanup(owned):
    for kind, item in reversed(owned):
        cmd = {
            "job": ["run", "jobs", "delete", item, "--region=" + REGION],
            "service_account": ["iam", "service-accounts", "delete", item],
            "secret": ["secrets", "delete", item],
        }[kind]
        try:
            call(cmd, timeout=300)
            print("TEMP_" + kind.upper() + "_DELETION_REQUESTED", flush=True)
        except GuardStop:
            print("WARNING_" + kind.upper() + "_CLEANUP_UNVERIFIED", flush=True)


def completed_execution(job):
    latest = call(["run", "jobs", "executions", "describe-latest",
                   "--job=" + job, "--region=" + REGION], output_json=True)
    if not isinstance(latest, dict):
        raise GuardStop("LAB_EXECUTION_UNVERIFIED")
    name = str(latest.get("name") or (latest.get("metadata") or {}).get("name") or "").split("/")[-1]
    status = latest.get("status")
    if (not re.fullmatch(re.escape(job) + r"-[a-z0-9-]+", name)
            or not isinstance(status, dict) or not isinstance(status.get("completionTime"), str)
            or not status["completionTime"]
            or type(status.get("runningCount", 0)) is not int or status.get("runningCount", 0) != 0):
        raise GuardStop("LAB_EXECUTION_STILL_RUNNING_OR_UNKNOWN")
    try:
        when = datetime.datetime.fromisoformat(status["completionTime"].replace("Z", "+00:00"))
        if when.tzinfo is None or when.utcoffset() is None:
            raise ValueError("timezone missing")
    except ValueError as exc:
        raise GuardStop("LAB_EXECUTION_STILL_RUNNING_OR_UNKNOWN") from exc
    return name


def completed_fence_markers(job, execution):
    """Collect only explicit fence markers from this exact execution."""
    query = ('resource.type="cloud_run_job" AND resource.labels.job_name="' + job + '" AND '
             '(labels.execution_name="' + execution + '" OR '
             'labels."run.googleapis.com/execution_name"="' + execution + '")')
    for attempt in range(10):
        rows = call(["logging", "read", query, "--limit=100"], output_json=True)
        if not isinstance(rows, list):
            raise GuardStop("LAB_FENCE_LOG_FORMAT_INVALID")
        filtered = [row for row in rows if isinstance(row, dict)
                    and row.get("resource", {}).get("labels", {}).get("job_name") == job
                    and (row.get("labels", {}).get("execution_name") == execution
                         or row.get("labels", {}).get("run.googleapis.com/execution_name") == execution)]
        markers = catalog._log_tokens(filtered)
        if any(markers.get(k) == "true" for k in (
                "FENCE_RESTORED", "FENCE_NOT_ATTEMPTED", "FENCE_BASELINE_TRUE")):
            return markers
        if attempt < 9:
            time.sleep(3)
    raise GuardStop("LAB_FENCE_MARKERS_UNAVAILABLE")


def reconcile_fence_after_failure(job):
    """Never repeat SQL; restore only after exact completed baseline evidence."""
    try:
        execution = completed_execution(job)
        markers = completed_fence_markers(job, execution)
        if markers.get("FENCE_RESTORED") == "true" or markers.get("FENCE_NOT_ATTEMPTED") == "true":
            return True
        if markers.get("FENCE_BASELINE_TRUE") != "true":
            return False
        # Same private job, explicit recovery-only mode: no migration SQL runs.
        call(["run", "jobs", "execute", job, "--region=" + REGION, "--wait",
              "--update-env-vars=LAB_FENCE_MODE=RECOVER"], timeout=600)
        recovery = completed_execution(job)
        if recovery == execution:
            raise GuardStop("LAB_RECOVERY_EXECUTION_UNVERIFIED")
        rows = catalog.job_logs_for_one_execution(job, recovery, {"FENCE_RESTORED"})
        catalog.require_markers(rows, {"FENCE_RESTORED": "true"})
        print("LAB_CONNECTION_FENCE_RECOVERY_VERIFIED=True", flush=True)
        return True
    except (GuardStop, OSError, ValueError, TypeError):
        return False


def apply(host, content):
    email = SA + "@" + LAB + ".iam.gserviceaccount.com"
    job = JOB_PREFIX + secrets.token_hex(4)
    password = secrets.token_urlsafe(48)
    admin_password = secrets.token_urlsafe(48)
    owned = []
    fence_maybe_active = False
    fence_restored = False
    try:
        # No API activation beyond the lab's existing audited services.
        print("=== LAB_ATOMIC_036_037_TRANSITION ===", flush=True)
        for name, data in ((SQL_SECRET, fenced_payload(content).encode()),
                           (PASSWORD_SECRET, password.encode()),
                           (ADMIN_SECRET, admin_password.encode())):
            try:
                call(["secrets", "create", name, "--replication-policy=automatic",
                      "--data-file=-"], data=data, timeout=180)
            except GuardStop:
                print("STOP: LAB_TEMP_SECRET_CREATION_OUTCOME_UNCERTAIN_DO_NOT_RETRY", flush=True)
                raise
            owned.append(("secret", name))
        try:
            call(["iam", "service-accounts", "create", SA,
                  "--display-name=One-shot lab migration 036 037"])
        except GuardStop:
            print("STOP: LAB_TEMP_IDENTITY_CREATION_OUTCOME_UNCERTAIN_DO_NOT_RETRY", flush=True)
            raise
        owned.append(("service_account", email))
        for name in (SQL_SECRET, PASSWORD_SECRET, ADMIN_SECRET):
            bind_temporary_secret_accessor(name)
        # LAB ONLY. This changes the copied migrator password and persists after
        # secrets are removed. It never sets a source Preview credential.
        call(["sql", "users", "set-password", MIGRATOR,
              "--instance=" + SQL, "--password=" + password], timeout=600)
        print("LAB_MIGRATOR_PASSWORD_ROTATED=True", flush=True)
        # The copied lab postgres password is rotated only on the lab instance;
        # it is needed to close and recover the target database connection gate.
        call(["sql", "users", "set-password", "postgres",
              "--instance=" + SQL, "--password=" + admin_password], timeout=600)
        print("LAB_POSTGRES_PASSWORD_ROTATED=True", flush=True)
        cmd = ["run", "jobs", "create", job, "--region=" + REGION,
               "--image=docker.io/library/postgres:16",
               "--service-account=" + email, "--command=/bin/sh",
               "--args=/run/transition/fenced-entrypoint.sh",
               "--set-env-vars=PGHOST=" + host + ",PGPORT=5432,"
               "PGUSER=" + MIGRATOR + ",PGDATABASE=khedmah,PGSSLMODE=require,"
               "PGCONNECT_TIMEOUT=10,PGOPTIONS=-c statement_timeout=120000 -c lock_timeout=5000",
               "--set-secrets=PGPASSWORD=" + PASSWORD_SECRET + ":latest,"
               "LAB_FENCE_ADMIN_PASSWORD=" + ADMIN_SECRET + ":latest,"
               "/run/transition/fenced-entrypoint.sh=" + SQL_SECRET + ":latest",
               "--network=" + NET, "--subnet=" + SUB,
               "--vpc-egress=all-traffic", "--tasks=1", "--parallelism=1",
               "--max-retries=0", "--task-timeout=240s",
               "--cpu=1", "--memory=512Mi"]
        # Own the name before creation: a timed-out control-plane response
        # can still leave a billable job, so always attempt deletion in finally.
        owned.append(("job", job))
        call(cmd, timeout=900)
        cfg = call(["run", "jobs", "describe", job, "--region=" + REGION],
                   output_json=True)
        blob = json.dumps(cfg).lower()
        if not all(x in blob for x in (NET, SUB, email)) or not (
                "all-traffic" in blob or "all_traffic" in blob):
            raise GuardStop("LAB_PRIVATE_JOB_CONFIGURATION_FAILED")
        expected = {"PROBE_035": "true", "PROBE_036": "true",
                    "PROBE_037_TYPE": "true", "PROBE_037_PRIVATE": "true",
                    "FENCE_RESTORED": "true"}
        # A timed-out execute may have closed the DB connection gate remotely.
        fence_maybe_active = True
        rows = catalog.run_job(job, required_keys=expected)
        catalog.require_markers(rows, expected)
        fence_restored = True
        print("LAB_SCHEMA_035_036_037_VERIFIED=True", flush=True)
        print("LAB_TRANSITION_COMMITTED_AND_READBACK_VERIFIED=True", flush=True)
        return 0
    finally:
        if fence_maybe_active and not fence_restored:
            fence_restored = reconcile_fence_after_failure(job)
        if not fence_maybe_active or fence_restored:
            cleanup(owned)
        else:
            # Keep the exact private job, service account and scoped secrets for
            # recovery; do not destroy the credential needed to reopen the DB.
            print("STOP: LAB_FENCE_AND_TEMP_RESOURCES_UNVERIFIED_DO_NOT_RETRY", flush=True)
        print("PREVIEW_MUTATION_REQUESTED=False", flush=True)
        print("PRODUCTION_MUTATION_REQUESTED=False", flush=True)
        print("RESTORE_REEXECUTED=False", flush=True)

def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args(argv)
    if args.plan == args.execute or (
            args.execute and args.confirm != CONFIRM):
        print("STOP: EXPLICIT_LAB_MODE_AND_CONFIRMATION_REQUIRED", flush=True)
        return 2
    try:
        content = candidate_sql()
        # Validate the recovery entrypoint before any cloud preflight or write.
        fenced_payload(content)
        host = guarded_preflight()
        print("LAB_TRANSITION_SOURCE_SHA256=" +
              hashlib.sha256(content.encode()).hexdigest(), flush=True)
        if args.plan:
            print("LAB_036_037_PLAN_ONLY_NO_MUTATIONS", flush=True)
            return 0
        return apply(host, content)
    except (GuardStop, OSError, ValueError) as exc:
        # Never print exceptions from lower-level resource operations which
        # might contain credential/config input; only typed guard errors.
        message = str(exc)
        print("STOP: " + (message if message.startswith((
            "LAB_", "PRIVATE_", "UNEXPECTED_", "TRANSITION_", "CATALOG_",
            "MIGRATOR_", "EXACT_", "SCOPED_", "GCLOUD_", "FIREWALL_", "SQL_"
        )) else "LAB_TRANSITION_FAILED_REVIEW_LOGS"), flush=True)
        return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
