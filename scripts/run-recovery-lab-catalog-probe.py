#!/usr/bin/env python3
"""One-shot private Cloud SQL catalog proof, lab only. --plan never mutates.

--execute creates a temporary non-superuser PostgreSQL account, Secret Manager
credential, service account and VPC-attached Cloud Run Job; it performs catalog
SELECT only, then requests cleanup. Never touches source Preview or production.
"""
import argparse
import base64
import ipaddress
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time

LAB = "khedmah-restore-lab-20261112"
SQL = "khedmah-restore-pg16-20261114"
NET = "khedmah-restore-private"
SUB = "khedmah-restore-ew1"
REGION = "europe-west1"
PSA = ipaddress.ip_network("10.166.0.0/16")
USER = "khedmah_catalog_ro"
SA = "khedmah-lab-catalog-ro"
SECRET = "khedmah-lab-catalog-credential"
JOB = "khedmah-lab-catalog-probe"
BOOT_JOB = "khedmah-lab-catalog-grant"
BOOT_SECRET = "khedmah-lab-catalog-bootstrap"
ROLE = "pg_read_all_settings"

# Strict metadata-only checks mapped to governed migrations 035, 036, 037.
CATALOG_SQL = """
SELECT 'LAB_PROBE_DATABASE=' || current_database();
SELECT 'LAB_PROBE_READ_ONLY=' || current_setting('transaction_read_only');
SELECT 'LAB_PROBE_SUPERUSER=' || pg_has_role(current_user,'cloudsqlsuperuser','member')::text;
SELECT 'LAB_PROBE_TABLE_SELECT=' || CASE
 WHEN to_regclass('public.core_user_accounts') IS NULL THEN 'false'
 ELSE has_table_privilege(current_user,'public.core_user_accounts','SELECT')::text END;
SELECT 'LAB_PROBE_CORE_001=' || (to_regclass('public.core_user_accounts') IS NOT NULL)::text;
SELECT 'LAB_PROBE_ORDER_026=' || (to_regclass('public.fulfillment_orders') IS NOT NULL)::text;
SELECT 'LAB_PROBE_035=' || EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='admin_roles'
    AND c.conname='admin_roles_role_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%taxi_pricing_admin%'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%category_admin%'
)::text;
SELECT 'LAB_PROBE_036=' || EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='enforce_ad_free_slot_limit'
    AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%AD_DAILY_QUOTA_EXHAUSTED%'
    AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%AD_WEEKLY_QUOTA_EXHAUSTED%'
)::text;
SELECT 'LAB_PROBE_037_TYPE=' || EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='media_assets'
    AND c.conname='media_assets_asset_type_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%business_verification_evidence%'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%professional_verification_evidence%'
)::text;
SELECT 'LAB_PROBE_037_PRIVATE=' || EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='media_assets'
    AND c.conname='media_assets_verification_evidence_private_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%visibility%'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%private%'
)::text;
""".strip()
MARKERS = ("DATABASE", "READ_ONLY", "SUPERUSER", "TABLE_SELECT", "CORE_001", "ORDER_026",
           "035", "036", "037_TYPE", "037_PRIVATE")


class GuardStop(RuntimeError):
    pass


def call(args, *, data=None, timeout=240, output_json=False):
    """Pin lab project and suppress stderr because errors can echo temporary passwords."""
    cmd = ["gcloud", "--quiet", "--project=" + LAB] + list(args)
    if output_json:
        cmd.append("--format=json")
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1",
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true")
    try:
        result = subprocess.run(cmd, input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GuardStop("GCLOUD_UNAVAILABLE_OR_TIMEOUT") from exc
    if result.returncode:
        raise GuardStop("GCLOUD_OPERATION_FAILED: " + "_".join(
            str(x).split("=")[0] for x in args[:3]))
    if output_json:
        try:
            return json.loads(result.stdout.decode())
        except (UnicodeError, ValueError) as exc:
            raise GuardStop("INVALID_CLOUD_RESPONSE") from exc
    return result.stdout.decode(errors="replace")


def require_private_instance(instance):
    settings = instance.get("settings") or {}
    config = settings.get("ipConfiguration") or {}
    ips = instance.get("ipAddresses") or []
    private = [row.get("ipAddress") for row in ips if row.get("type") == "PRIVATE"]
    if not (instance.get("name") == SQL and instance.get("state") == "RUNNABLE"
            and instance.get("region") == REGION
            and instance.get("databaseVersion") == "POSTGRES_16"
            and config.get("ipv4Enabled") is False
            and config.get("privateNetwork", "").endswith("/networks/" + NET)
            and config.get("sslMode") == "ENCRYPTED_ONLY"
            and not config.get("authorizedNetworks")
            and not any(row.get("type") == "PRIMARY" for row in ips)
            and len(private) == 1):
        raise GuardStop("PRIVATE_SQL_PRECHECK_FAILED")
    try:
        address = ipaddress.ip_address(private[0])
    except ValueError as exc:
        raise GuardStop("INVALID_PRIVATE_SQL_IP") from exc
    if address not in PSA:
        raise GuardStop("SQL_IP_OUTSIDE_APPROVED_PSA")
    return str(address)


def require_rules(rules):
    for name, action, priority, dest, proto in (
        ("khedmah-lab-deny-egress", "denied", 1000, "0.0.0.0/0", "all"),
        ("khedmah-lab-allow-postgres", "allowed", 900, str(PSA), "tcp"),
    ):
        row = next((r for r in rules if r.get("name") == name), None)
        target = ([{"IPProtocol": "all"}] if proto == "all" else
                  [{"IPProtocol": "tcp", "ports": ["5432"]}])
        if not (row and row.get("network", "").endswith("/networks/" + NET)
                and row.get("direction") == "EGRESS"
                and row.get("destinationRanges") == [dest]
                and int(row.get("priority", -1)) == priority
                and row.get(action) == target and not row.get("disabled")
                and not row.get("targetTags") and not row.get("targetServiceAccounts")):
            raise GuardStop("FIREWALL_PRECHECK_FAILED: " + name)
    approved = {"khedmah-lab-deny-egress", "khedmah-lab-allow-postgres"}
    if any(row.get("network", "").endswith("/networks/" + NET)
           and row.get("name") not in approved for row in rules):
        raise GuardStop("UNEXPECTED_LAB_VPC_FIREWALL_RULE")


def classify_log(payload):
    """Return only exact catalog markers; never echo raw SQL output or user records."""
    found = {}
    for line in payload.splitlines():
        marker = re.fullmatch(
            r"\s*LAB_PROBE_([A-Z0-9_]+)=(true|false|on|off|khedmah)\s*", line)
        if marker and marker.group(1) in MARKERS:
            old = found.get(marker.group(1))
            if old is not None and old != marker.group(2):
                raise GuardStop("INCONSISTENT_CATALOG_LOG")
            found[marker.group(1)] = marker.group(2)
    if set(found) != set(MARKERS):
        raise GuardStop("INCOMPLETE_CATALOG_EVIDENCE")
    if found["DATABASE"] != "khedmah" or found["READ_ONLY"] != "on" \
            or found["SUPERUSER"] != "false" or found["TABLE_SELECT"] != "false":
        raise GuardStop("UNSAFE_CATALOG_SESSION_OR_IDENTITY")
    return {key: found[key] for key in MARKERS}


def preflight():
    print("=== PRIVATE LAB PREFLIGHT ===", flush=True)
    vpc = call(["compute", "networks", "describe", NET], output_json=True)
    if vpc.get("autoCreateSubnetworks") is not False or not any(
            p.get("state") == "ACTIVE" and "servicenetworking" in p.get("name", "")
            for p in vpc.get("peerings", [])):
        raise GuardStop("PRIVATE_NETWORK_PRECHECK_FAILED")
    subnet = call(["compute", "networks", "subnets", "describe", SUB,
                   "--region=" + REGION], output_json=True)
    if subnet.get("ipCidrRange") != "10.240.8.0/24" \
            or not subnet.get("network", "").endswith("/networks/" + NET):
        raise GuardStop("PRIVATE_SUBNET_PRECHECK_FAILED")
    require_rules(call(["compute", "firewall-rules", "list"], output_json=True))
    instances = call(["sql", "instances", "list"], output_json=True)
    if not isinstance(instances, list) or len(instances) != 1 \
            or instances[0].get("name") != SQL:
        raise GuardStop("UNEXPECTED_SQL_INSTANCE_IN_LAB")
    host = require_private_instance(
        call(["sql", "instances", "describe", SQL], output_json=True))
    databases = call(["sql", "databases", "list", "--instance=" + SQL],
                     output_json=True)
    if not any(row.get("name") == "khedmah" for row in databases):
        raise GuardStop("RESTORED_DATABASE_ABSENT")
    users = call(["sql", "users", "list", "--instance=" + SQL],
                 output_json=True)
    if any(row.get("name") == USER for row in users):
        raise GuardStop("PREVIOUS_AUDIT_USER_EXISTS_DO_NOT_REUSE")
    print("PRIVATE_LAB_INSTANCE_VERIFIED", flush=True)
    return host


def result_from_cloud_logging(logs):
    messages = []
    for entry in logs if isinstance(logs, list) else []:
        if isinstance(entry, dict):
            raw = entry.get("textPayload")
            if isinstance(raw, str):
                messages.append(raw)
            payload = entry.get("jsonPayload") or {}
            if isinstance(payload, dict) and isinstance(payload.get("message"), str):
                messages.append(payload["message"])
            if isinstance(entry.get("message"), str):
                messages.append(entry["message"])
    return classify_log("\n".join(messages))


# Target-only administrator grant is necessary: Preview V2 deliberately revoked
# CONNECT on DB and USAGE on public schema from PUBLIC. pg_read_all_settings
# alone cannot even connect. The bootstrap grants ONLY these two privileges;
# it does not grant SELECT/INSERT/UPDATE/DELETE on application data.
GRANT_SQL = """
-- Validate privileges INSIDE PostgreSQL; Cloud SQL users.list can omit databaseRoles.
-- A failed guard prevents even the two temporary privilege grants.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'khedmah_catalog_ro'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  )
  OR NOT pg_catalog.pg_has_role('khedmah_catalog_ro', 'pg_read_all_settings', 'member')
  OR pg_catalog.pg_has_role('khedmah_catalog_ro', 'cloudsqlsuperuser', 'member')
  THEN
    RAISE EXCEPTION 'LAB_AUDITOR_ROLE_PROOF_FAILED';
  END IF;
END $guard$;
GRANT CONNECT ON DATABASE khedmah TO khedmah_catalog_ro;
GRANT USAGE ON SCHEMA public TO khedmah_catalog_ro;
SELECT 'LAB_GRANT_ROLE=' || pg_catalog.pg_has_role('khedmah_catalog_ro','pg_read_all_settings','member')::text;
SELECT 'LAB_GRANT_ADMIN=' || pg_catalog.pg_has_role('khedmah_catalog_ro','cloudsqlsuperuser','member')::text;
SELECT 'LAB_GRANT_CONNECT=' || has_database_privilege('khedmah_catalog_ro','khedmah','CONNECT')::text;
SELECT 'LAB_GRANT_USAGE=' || has_schema_privilege('khedmah_catalog_ro','public','USAGE')::text;
SELECT 'LAB_GRANT_CREATE=' || has_schema_privilege('khedmah_catalog_ro','public','CREATE')::text;
SELECT 'LAB_GRANT_SELECT=' || has_table_privilege('khedmah_catalog_ro','public.core_user_accounts','SELECT')::text;
""".strip()
REVOKE_SQL = """
REVOKE USAGE ON SCHEMA public FROM khedmah_catalog_ro;
REVOKE CONNECT ON DATABASE khedmah FROM khedmah_catalog_ro;
SELECT 'LAB_REVOKED_CONNECT=' || has_database_privilege('khedmah_catalog_ro','khedmah','CONNECT')::text;
SELECT 'LAB_REVOKED_USAGE=' || has_schema_privilege('khedmah_catalog_ro','public','USAGE')::text;
""".strip()


# Logs can arrive asynchronously, and Cloud Logging text payloads sometimes
# include a timestamp or structured logger prefix on the same line. Only read
# preselected job+execution log entries, and parse exact LAB_* key/value tokens.
_LOG_TOKEN = re.compile(
    r"(?:^|[^A-Za-z0-9_])LAB_([A-Z0-9_]+)="
    r"(true|false|on|off|khedmah)(?=$|[^A-Za-z0-9_=])"
)


def _log_tokens(rows):
    found = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        payload = row.get("jsonPayload") or {}
        raw = (row.get("textPayload")
               or (payload.get("message") if isinstance(payload, dict) else None)
               or row.get("message"))
        if not isinstance(raw, str):
            continue
        for line in raw.splitlines():
            for hit in _LOG_TOKEN.finditer(line):
                key, value = hit.groups()
                if key in found and found[key] != value:
                    raise GuardStop("CONFLICTING_SCOPED_MARKER")
                found[key] = value
    return found


def require_markers(rows, expected):
    found = _log_tokens(rows)
    actual = {key: found[key] for key in expected if key in found}
    if actual != expected:
        raise GuardStop("SCOPED_MARKERS_MISSING_OR_UNEXPECTED")
    return actual


def job_logs_for_one_execution(job, execution, required_keys):
    """Wait for complete *current execution* evidence, not first log line."""
    query = ('resource.type="cloud_run_job" AND '
             'resource.labels.job_name="' + job + '" AND '
             '(labels.execution_name="' + execution + '" OR '
             'labels."run.googleapis.com/execution_name"="' + execution + '")')
    for attempt in range(10):
        rows = call(["logging", "read", query, "--limit=100"], output_json=True)
        if not isinstance(rows, list):
            raise GuardStop("JOB_LOG_FORMAT_INVALID")
        filtered = [
            row for row in rows if isinstance(row, dict)
            and row.get("resource", {}).get("labels", {}).get("job_name") == job
            and (row.get("labels", {}).get("execution_name") == execution
                 or row.get("labels", {}).get("run.googleapis.com/execution_name") == execution)
        ]
        tokens = _log_tokens(filtered)
        if set(required_keys).issubset(tokens):
            return filtered
        if attempt < 9:
            time.sleep(3)
    raise GuardStop("EXACT_EXECUTION_MARKERS_INCOMPLETE")


def run_job(job, *, override_sql=None, required_keys=None):
    if not required_keys:
        raise GuardStop("REQUIRED_MARKERS_NOT_CONFIGURED")
    args = ["run", "jobs", "execute", job, "--region=" + REGION, "--wait"]
    if override_sql is not None:
        args += ["--update-env-vars=CHECKS_B64=" +
                 base64.b64encode(override_sql.encode()).decode()]
    call(args, timeout=600)
    latest = call(["run", "jobs", "executions", "describe-latest",
                   "--job=" + job, "--region=" + REGION], output_json=True)
    name = str(latest.get("name") or (latest.get("metadata") or {}).get("name") or "").split("/")[-1]
    if not re.fullmatch(re.escape(job) + r"-[a-z0-9-]+", name):
        raise GuardStop("EXECUTION_IDENTITY_UNVERIFIED")
    return job_logs_for_one_execution(job, name, required_keys)


def create_job(job, email, secret, host, sql_text, *, admin=False):
    values = {
        "PGHOST": host, "PGPORT": "5432",
        "PGUSER": "postgres" if admin else USER,
        "PGDATABASE": "khedmah", "PGSSLMODE": "require",
        "PGCONNECT_TIMEOUT": "10",
        "PGOPTIONS": "-c statement_timeout=15000 -c search_path=pg_catalog" if admin
            else "-c default_transaction_read_only=on -c statement_timeout=15000 -c search_path=pg_catalog",
        "CHECKS_B64": base64.b64encode(sql_text.encode()).decode(),
    }
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", delete=False) as f:
        json.dump(values, f)
        p = f.name
    try:
        command = 'printf %s "$CHECKS_B64" | base64 -d | psql -X -qAt -v ON_ERROR_STOP=1'
        call(["run", "jobs", "create", job, "--region=" + REGION,
              "--image=docker.io/library/postgres:16",
              "--service-account=" + email,
              "--command=/bin/sh", "--args=-c," + command,
              "--env-vars-file=" + p,
              "--set-secrets=PGPASSWORD=" + secret + ":latest",
              "--network=" + NET, "--subnet=" + SUB,
              "--vpc-egress=all-traffic", "--tasks=1", "--parallelism=1",
              "--max-retries=0", "--task-timeout=180s",
              "--cpu=1", "--memory=512Mi"], timeout=900)
    finally:
        os.unlink(p)
    cfg = call(["run", "jobs", "describe", job, "--region=" + REGION], output_json=True)
    blob = json.dumps(cfg).lower()
    if not (NET in blob and SUB in blob and email in blob and
            ("all-traffic" in blob or "all_traffic" in blob)):
        raise GuardStop("JOB_PRIVATE_VPC_ISOLATION_UNVERIFIED")


def execute(host):
    email = f"{SA}@{LAB}.iam.gserviceaccount.com"
    tag = secrets.token_hex(4)
    grant_job = BOOT_JOB + "-" + tag
    audit_job = JOB + "-" + tag
    owned = []
    grant_cleanup_required = False
    auditor_password = secrets.token_urlsafe(48)
    admin_password = secrets.token_urlsafe(48)
    try:
        print("=== LAB-ONLY TEMPORARY CATALOG READER ===", flush=True)
        call(["services", "enable", "iam.googleapis.com", "secretmanager.googleapis.com",
              "logging.googleapis.com", "run.googleapis.com"], timeout=900)
        jobs = call(["run", "jobs", "list", "--region=" + REGION], output_json=True)
        if not isinstance(jobs, list):
            raise GuardStop("JOB_INVENTORY_UNVERIFIED")
        if any(JOB in json.dumps(row) or BOOT_JOB in json.dumps(row) for row in jobs):
            raise GuardStop("PREVIOUS_CATALOG_JOBS_EXIST")
        accounts = call(["iam", "service-accounts", "list"], output_json=True)
        if any(row.get("email") == email for row in accounts):
            raise GuardStop("CATALOG_SERVICE_ACCOUNT_ALREADY_EXISTS")
        existing_secrets = call(["secrets", "list"], output_json=True)
        if any(row.get("name", "").endswith("/" + s) for row in existing_secrets
               for s in (SECRET, BOOT_SECRET)):
            raise GuardStop("CATALOG_SECRET_ALREADY_EXISTS")

        # Passwords live only in process memory and isolated lab Secret Manager.
        for name, password in ((SECRET, auditor_password), (BOOT_SECRET, admin_password)):
            call(["secrets", "create", name, "--replication-policy=automatic",
                  "--data-file=-"], data=password.encode())
            owned.append(("secret", name))
        call(["iam", "service-accounts", "create", SA,
              "--display-name=Temporary recovery-lab catalog probe"])
        owned.append(("service_account", email))
        for name in (SECRET, BOOT_SECRET):
            call(["secrets", "add-iam-policy-binding", name,
                  "--member=serviceAccount:" + email,
                  "--role=roles/secretmanager.secretAccessor"])

        # Default built-in SQL users can get cloudsqlsuperuser unless roles are explicit.
        call(["sql", "users", "create", USER, "--instance=" + SQL,
              "--type=BUILT_IN", "--password=" + auditor_password,
              "--database-roles=" + ROLE], timeout=600)
        owned.append(("database_user", USER))
        users = call(["sql", "users", "list", "--instance=" + SQL], output_json=True)
        # Cloud SQL user-list API may omit the databaseRoles member entirely.
        # Do not confuse missing control-plane metadata with a missing SQL role.
        # The real PostgreSQL role/attribute membership is enforced by GRANT_SQL
        # BEFORE granting CONNECT/USAGE, and that job must return verified proof.
        found = [row for row in users if row.get("name") == USER]
        if len(found) != 1 or found[0].get("type", "BUILT_IN") != "BUILT_IN":
            raise GuardStop("AUDITOR_USER_IDENTITY_UNVERIFIED")
        roles = found[0].get("databaseRoles")
        if roles is not None:
            if not isinstance(roles, list) or any(
                (r.get("name") if isinstance(r, dict) else r) != ROLE for r in roles
            ):
                raise GuardStop("AUDIT_USER_CONTROL_PLANE_ROLE_MISMATCH")
        if roles != [ROLE]:
            print("AUDIT_ROLE_PROOF: DEFERRED_TO_PRIVATE_POSTGRESQL_GUARD", flush=True)

        # Rotating only the LAB postgres password avoids importing source credentials
        # into an admin job; old source password will NOT be restored on the lab.
        call(["sql", "users", "set-password", "postgres", "--instance=" + SQL,
              "--password=" + admin_password], timeout=600)
        print("LAB_POSTGRES_ADMIN_PASSWORD_ROTATED: True", flush=True)
        create_job(grant_job, email, BOOT_SECRET, host, GRANT_SQL, admin=True)
        owned.append(("job", grant_job))
        # Even if its success logs are missing, the grant may already have run.
        grant_cleanup_required = True
        required_grants = {
            "GRANT_ROLE": "true", "GRANT_ADMIN": "false",
            "GRANT_CONNECT": "true", "GRANT_USAGE": "true",
            "GRANT_CREATE": "false", "GRANT_SELECT": "false",
        }
        require_markers(
            run_job(grant_job, required_keys=required_grants),
            required_grants,
        )
        print("LAB_MINIMAL_CONNECT_AND_SCHEMA_USAGE: VERIFIED", flush=True)
        create_job(audit_job, email, SECRET, host, CATALOG_SQL)
        owned.append(("job", audit_job))
        rows = run_job(audit_job, required_keys={"PROBE_" + name for name in MARKERS})
        markers = classify_log("\n".join(
            str(row.get("textPayload") or (row.get("jsonPayload") or {}).get("message") or "")
            for row in rows))
        print("=== LAB CATALOG BOOLEAN RESULTS ===", flush=True)
        for k, v in markers.items():
            print("LAB_PROBE_" + k + ": " + v, flush=True)
        print("CATALOG_PROBE_EXECUTED: True", flush=True)
        return 0
    finally:
        # Grants depend on the PostgreSQL account; REVOKE before dropping it.
        if grant_cleanup_required:
            try:
                required_revocations = {
                    "REVOKED_CONNECT": "false", "REVOKED_USAGE": "false",
                }
                require_markers(
                    run_job(grant_job, override_sql=REVOKE_SQL,
                            required_keys=required_revocations),
                    required_revocations,
                )
                print("TEMPORARY_PG_GRANTS_REVOKED: VERIFIED", flush=True)
            except GuardStop:
                print("WARNING_TEMPORARY_PG_GRANT_REVOKE_UNVERIFIED", flush=True)
        for kind, name in reversed(owned):
            args = {"job": ["run", "jobs", "delete", name, "--region=" + REGION],
                    "database_user": ["sql", "users", "delete", name, "--instance=" + SQL],
                    "service_account": ["iam", "service-accounts", "delete", name],
                    "secret": ["secrets", "delete", name]}[kind]
            try:
                call(args, timeout=300)
                print("TEMPORARY_" + kind.upper() + "_REMOVAL_REQUESTED", flush=True)
            except GuardStop:
                print("WARNING_TEMPORARY_" + kind.upper() + "_CLEANUP_UNVERIFIED", flush=True)
        print("RESTORE_REEXECUTED=False", flush=True)
        print("SOURCE_MUTATION_REQUESTED=False", flush=True)
        print("PRODUCTION_DEPLOYED=False", flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--plan", action="store_true")
    modes.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    try:
        host = preflight()
        if args.plan:
            print("CATALOG_PROBE_PLAN_ONLY: no changes")
            return 0
        return execute(host)
    except GuardStop as exc:
        print("STOP: " + str(exc), flush=True)
        return 2


if __name__ == "__main__":
    sys.exit(main())
