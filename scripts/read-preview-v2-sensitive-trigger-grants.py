#!/usr/bin/env python3
"""Inspect sensitive Preview V2 PostgreSQL trigger/grant *metadata* read-only.

Reuses the pinned and source-verified Cloud SQL Auth Proxy transport in
read-preview-v2-schema.py. Never selects application rows, changes an ACL,
executes a migration, or claims an operational writer fence.
"""
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

SOURCE = Path(__file__).with_name("read-preview-v2-schema.py")
SOURCE_BLOB = "1f1565473cc1ab8d8e98791f0fc4af440f9d3d32"
PROJECT = "khedmah-preview-v2-20261012"
INSTANCE = "khedmah-preview-v2-db"

# Static, catalog-only SQL. No application data, dynamic inputs or mutations.
SQL = """
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
WITH targets(name) AS (
 VALUES ('audit_logs'),('billing_credit_ledger'),
        ('billing_usage_receipts'),('billing_promo_redemptions'),
        ('fulfillment_order_events'),('identity_sessions')
)
SELECT json_build_object(
  'database', current_database(),
  'reader', current_user,
  'read_only', current_setting('transaction_read_only'),
  'tables', (
   SELECT json_agg(json_build_object(
     'name', t.name,
     'exists', c.oid IS NOT NULL,
     'kind', c.relkind,
     'owner', pg_get_userbyid(c.relowner),
     'rls_enabled', c.relrowsecurity,
     'rls_forced', c.relforcerowsecurity,
     'app_update', CASE WHEN c.oid IS NULL THEN NULL
                   ELSE has_table_privilege('khedmah_app',c.oid,'UPDATE') END,
     'app_delete', CASE WHEN c.oid IS NULL THEN NULL
                   ELSE has_table_privilege('khedmah_app',c.oid,'DELETE') END,
     'triggers', (
       SELECT coalesce(json_agg(json_build_object(
         'name',g.tgname,
         'enabled_mode',g.tgenabled,
         'before', (g.tgtype & 2)<>0,
         'on_update', (g.tgtype & 16)<>0,
         'on_delete', (g.tgtype & 8)<>0,
         'per_row', (g.tgtype & 1)<>0,
         'function_name',f.proname
       ) ORDER BY g.tgname),'[]'::json)
       FROM pg_trigger g JOIN pg_proc f ON f.oid=g.tgfoid
       WHERE g.tgrelid=c.oid AND NOT g.tgisinternal
     )
   ) ORDER BY t.name)
   FROM targets t LEFT JOIN pg_class c
     ON c.relnamespace='public'::regnamespace AND c.relname=t.name
  )
);
ROLLBACK;
"""

EXPECTED = {
    "billing_credit_ledger": "billing_credit_ledger_no_rewrite",
    "billing_usage_receipts": "billing_usage_receipts_no_rewrite",
    "billing_promo_redemptions": "billing_promo_redemptions_no_rewrite",
}


def stop(code):
    raise SystemExit("STOP: " + code)


def module_reader():
    raw = SOURCE.read_bytes()
    observed = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    if observed != SOURCE_BLOB:
        stop("PINNED_READONLY_TRANSPORT_SOURCE_CHANGED")
    spec = importlib.util.spec_from_file_location("khedmah_sql_readonly_reader", SOURCE)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    if reader.PROJECT != PROJECT or reader.INSTANCE != INSTANCE:
        stop("TARGET_IDENTITY_MISMATCH")
    return reader


def query(reader, work, password):
    if not re.fullmatch(r"[0-9a-f]{64}", password):
        stop("MIGRATOR_PASSWORD_FORMAT_REJECTED")
    socket_dir = str(work / reader.CONNECTION)
    pgpass = work / "metadata.pgpass"
    with pgpass.open("x") as out:
        os.chmod(pgpass, 0o600)
        out.write(socket_dir.replace("\\", "\\\\").replace(":", "\\:")
                  + ":5432:" + reader.DATABASE + ":" + reader.USER
                  + ":" + password + "\n")
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("PG", "CSQL_PROXY_", "GOOGLE_"))}
    env.update(
        PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
        PGOPTIONS="-c role=none -c search_path=pg_catalog "
                  "-c default_transaction_read_only=on "
                  "-c statement_timeout=20000 -c lock_timeout=5000",
    )
    try:
        run = subprocess.run(
            ["psql", "-X", "-w", "-q", "-A", "-t",
             "-h", socket_dir, "-p", "5432", "-U", reader.USER,
             "-d", reader.DATABASE, "-v", "ON_ERROR_STOP=1",
             "-P", "pager=off"],
            input=SQL, capture_output=True, text=True, timeout=45, env=env,
        )
    finally:
        pgpass.unlink(missing_ok=True)
    # Never echo driver stdout/stderr on failure, since their provenance may vary.
    if run.returncode or len(run.stdout) > 16384:
        stop("METADATA_QUERY_FAILED")
    try:
        data = json.loads(run.stdout)
    except ValueError:
        stop("METADATA_RESPONSE_INVALID")
    if (not isinstance(data, dict) or set(data) !=
            {"database", "reader", "read_only", "tables"} or
            data["database"] != reader.DATABASE or
            data["reader"] != reader.USER or data["read_only"] != "on" or
            not isinstance(data["tables"], list) or len(data["tables"]) != 6):
        stop("METADATA_RESPONSE_INVALID")
    names = {x.get("name") for x in data["tables"] if isinstance(x, dict)}
    if names != set(EXPECTED) | {"audit_logs", "fulfillment_order_events", "identity_sessions"}:
        stop("TABLE_SCOPE_UNEXPECTED")
    result = []
    for t in data["tables"]:
        if not isinstance(t.get("triggers"), list) or len(t["triggers"]) > 30:
            stop("TRIGGER_RESPONSE_INVALID")
        names = []
        protected = False
        for g in t["triggers"]:
            if (not isinstance(g, dict) or
                    set(g) != {"name", "enabled_mode", "before", "on_update",
                               "on_delete", "per_row", "function_name"} or
                    any(type(g[k]) is not bool for k in
                        ("before", "on_update", "on_delete", "per_row")) or
                    g["enabled_mode"] not in ("O", "A", "D", "R")):
                stop("TRIGGER_RESPONSE_INVALID")
            # A matching name/shape is metadata evidence only, not function body proof.
            shape = (g["name"] == EXPECTED.get(t["name"]) and
                     g["function_name"] == "reject_billing_ledger_mutation" and
                     g["enabled_mode"] in ("O", "A") and g["before"] and
                     g["on_update"] and g["on_delete"] and g["per_row"])
            protected |= shape
            names.append({"name": g["name"], "mode": g["enabled_mode"],
                          "before_update_delete": (g["before"] and
                                                   g["on_update"] and g["on_delete"]),
                          "function": g["function_name"]})
        result.append({
            "table": t["name"], "exists": t["exists"], "kind": t["kind"],
            "owner": t["owner"], "app_update": t["app_update"],
            "app_delete": t["app_delete"], "rls_enabled": t["rls_enabled"],
            "rls_forced": t["rls_forced"],
            "trigger_names_and_modes": names,
            "expected_billing_guard_shape_observed": protected if t["name"] in EXPECTED else None,
        })
    return result


def inspect():
    if sys.argv[1:] != ["--inspect"]:
        stop("USE_INSPECT_ONLY")
    if not all(shutil.which(c) for c in ("gh", "gcloud", "psql", "cloud-sql-proxy")):
        stop("REQUIRED_TOOLS_MISSING")
    os.umask(0o077)
    reader = module_reader()
    reader.preflight()
    reader.validate_instance(reader.cloud(
        "sql", "instances", "describe", reader.INSTANCE,
        fields="name,project,region,connectionName,state,databaseVersion"))
    if reader.cloud("secrets", "versions", "describe", "1",
                    "--secret=" + reader.SECRET, fields="name,state") != {
                        "name": reader.RESOURCE, "state": "ENABLED"}:
        stop("EXPECTED_SECRET_VERSION_NOT_ENABLED")
    token = reader.cloud("auth", "print-access-token").decode("ascii").strip()
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    password = reader.read_password(token)
    with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as d:
        work = Path(d)
        os.chmod(work, 0o700)
        socket = work / reader.CONNECTION / ".s.PGSQL.5432"
        if len(str(socket).encode()) >= 104:
            stop("PRIVATE_SOCKET_PATH_TOO_LONG")
        proxy = None
        try:
            with (work / "proxy.log").open("x") as log:
                os.chmod(work / "proxy.log", 0o600)
                proxy = subprocess.Popen(
                    ["cloud-sql-proxy", reader.CONNECTION,
                     "--unix-socket=" + str(work)],
                    stdout=log, stderr=subprocess.STDOUT,
                    env=reader.proxy_environment(token))
                deadline = time.monotonic() + 45
                while not socket.exists():
                    if proxy.poll() is not None or time.monotonic() >= deadline:
                        stop("PRIVATE_SQL_PROXY_NOT_READY")
                    time.sleep(0.25)
                if proxy.poll() is not None or not stat.S_ISSOCK(socket.stat().st_mode):
                    stop("PRIVATE_SOCKET_INVALID")
                rows = query(reader, work, password)
        finally:
            reader.stop_proxy(proxy)
    print(json.dumps({
        "stage": "PREVIEW_V2_SENSITIVE_TRIGGER_METADATA_READ_ONLY",
        "project": PROJECT, "database": reader.DATABASE,
        "tables": rows, "application_rows_read": False,
        "cloud_resource_mutation": False, "sql_grants_mutation": False,
        "schema_mutation": False, "table_data_mutation": False,
        "function_bodies_verified": False, "writer_fence_verified": False,
        "release_authorized": False,
    }, sort_keys=True))


if __name__ == "__main__":
    try:
        inspect()
    except (OSError, ValueError, TypeError, KeyError, AttributeError,
            subprocess.SubprocessError, UnicodeError):
        stop("METADATA_INSPECTION_UNCONFIRMED")
