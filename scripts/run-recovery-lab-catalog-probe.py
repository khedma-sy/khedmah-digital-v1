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
ROLE = "pg_read_all_settings"

# Strict metadata-only checks mapped to governed migrations 035, 036, 037.
CATALOG_SQL = """
SELECT 'LAB_PROBE_DATABASE=' || current_database();
SELECT 'LAB_PROBE_READ_ONLY=' || current_setting('transaction_read_only');
SELECT 'LAB_PROBE_SUPERUSER=' || pg_has_role(current_user,'cloudsqlsuperuser','member')::text;
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
MARKERS = ("DATABASE", "READ_ONLY", "SUPERUSER", "CORE_001", "ORDER_026",
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
            or found["SUPERUSER"] != "false":
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
    return classify_log("\n".join(messages))


def execute(host):
    email = f"{SA}@{LAB}.iam.gserviceaccount.com"
    owned = []
    credential = secrets.token_urlsafe(48)
    try:
        print("=== LAB-ONLY TEMPORARY CATALOG WORKLOAD ===", flush=True)
        call(["services", "enable", "iam.googleapis.com",
              "secretmanager.googleapis.com"], timeout=900)
        listed = json.loads(call(["run", "jobs", "list", "--region=" + REGION,
                                  "--format=json"]))
        if not isinstance(listed, list):
            raise GuardStop("JOB_INVENTORY_UNVERIFIED")
        if any(row.get("metadata", {}).get("name", "").endswith("/" + JOB)
               or row.get("metadata", {}).get("name") == JOB
               or row.get("name", "").endswith("/" + JOB)
               for row in listed):
            raise GuardStop("PREVIOUS_CATALOG_JOB_EXISTS")
        accounts = call(["iam", "service-accounts", "list"], output_json=True)
        if any(row.get("email") == email for row in accounts):
            raise GuardStop("PREVIOUS_CATALOG_SERVICE_ACCOUNT_EXISTS")
        secrets_list = call(["secrets", "list"], output_json=True)
        if any(row.get("name", "").endswith("/" + SECRET)
               for row in secrets_list):
            raise GuardStop("PREVIOUS_CATALOG_SECRET_EXISTS")
        call(["secrets", "create", SECRET, "--replication-policy=automatic",
              "--data-file=-"], data=credential.encode())
        owned.append("secret")
        call(["iam", "service-accounts", "create", SA,
              "--display-name=Short-lived private catalog probe"])
        owned.append("service_account")
        call(["secrets", "add-iam-policy-binding", SECRET,
              "--member=serviceAccount:" + email,
              "--role=roles/secretmanager.secretAccessor"])
        # CRITICAL: Explicit PostgreSQL role avoids Cloud SQL's default cloudsqlsuperuser.
        call(["sql", "users", "create", USER, "--instance=" + SQL,
              "--type=BUILT_IN", "--password=" + credential,
              "--database-roles=" + ROLE], timeout=600)
        owned.append("database_user")
        users = call(["sql", "users", "list", "--instance=" + SQL],
                     output_json=True)
        found = [row for row in users if row.get("name") == USER]
        if len(found) != 1:
            raise GuardStop("AUDITOR_IDENTITY_UNVERIFIED")
        roles = [r.get("name") if isinstance(r, dict) else r
                 for r in found[0].get("databaseRoles", [])]
        if roles != [ROLE] or "cloudsqlsuperuser" in roles:
            raise GuardStop("AUDITOR_ROLE_UNVERIFIED_OR_ELEVATED")
        values = {"PGHOST": host, "PGPORT": "5432", "PGUSER": USER,
                  "PGDATABASE": "khedmah", "PGSSLMODE": "require",
                  "PGCONNECT_TIMEOUT": "10",
                  "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=15000 -c search_path=pg_catalog",
                  "CHECKS_B64": base64.b64encode(CATALOG_SQL.encode()).decode()}
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
                                         suffix=".json", delete=False) as tmp:
            json.dump(values, tmp)
            tmp_path = tmp.name
        try:
            # psql receives static catalog SQL through base64 env, not CLI args.
            command = 'printf %s "$CHECKS_B64" | base64 -d | psql -X -qAt -v ON_ERROR_STOP=1'
            call(["run", "jobs", "create", JOB, "--region=" + REGION,
                  "--image=docker.io/library/postgres:16",
                  "--service-account=" + email,
                  "--command=/bin/sh", "--args=-c," + command,
                  "--env-vars-file=" + tmp_path,
                  "--set-secrets=PGPASSWORD=" + SECRET + ":latest",
                  "--network=" + NET, "--subnet=" + SUB, "--vpc-egress=all-traffic",
                  "--tasks=1", "--parallelism=1", "--max-retries=0",
                  "--task-timeout=180s", "--cpu=1", "--memory=512Mi"], timeout=900)
            owned.append("cloud_run_job")
        finally:
            os.unlink(tmp_path)
        config = call(["run", "jobs", "describe", JOB,
                       "--region=" + REGION], output_json=True)
        representation = json.dumps(config).lower()
        if not (NET in representation and SUB in representation
                and ("all-traffic" in representation or "all_traffic" in representation)
                and email in representation):
            raise GuardStop("CLOUD_RUN_PRIVATE_EGRESS_UNVERIFIED")
        call(["run", "jobs", "execute", JOB, "--region=" + REGION,
              "--wait"], timeout=600)
        logs = call(["run", "jobs", "logs", "read", JOB,
                     "--region=" + REGION, "--limit=50"], output_json=True)
        markers = result_from_cloud_logging(logs)
        print("=== LAB SCHEMA CATALOG (NO CUSTOMER ROWS) ===", flush=True)
        for key, value in markers.items():
            print("LAB_PROBE_" + key + ": " + value, flush=True)
        print("LAB_CATALOG_PROBE: PASS", flush=True)
        return 0
    finally:
        # Delete only exact lab temporary resources created by this run.
        for name, args in (
            ("cloud_run_job", ["run", "jobs", "delete", JOB,
                               "--region=" + REGION]),
            ("database_user", ["sql", "users", "delete", USER,
                               "--instance=" + SQL]),
            ("service_account", ["iam", "service-accounts", "delete", email]),
            ("secret", ["secrets", "delete", SECRET]),
        ):
            if name in owned:
                try:
                    call(args, timeout=300)
                    print("TEMPORARY_" + name.upper() + "_REMOVAL_REQUESTED", flush=True)
                except GuardStop:
                    print("WARNING_" + name.upper() + "_CLEANUP_UNVERIFIED", flush=True)
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
