#!/usr/bin/env python3
"""Owner-operated Phase B: postgres credential containment, runtime role replacement,
then one instance restart and read-only isolation/fresh-catalog verification.

Requires separate explicit approval and a new successful post-Phase-A backup.
Does not change application credentials/secrets, migrate schema, or deploy.
No automatic retry, role re-elevation, restore, or hidden recovery on failure.
"""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import re
import secrets
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

CONFIRMATION = "CUTOVER_KHEDMAH_RUNTIME_AND_RESTART"
BACKUP_DESCRIPTION = "khedmah-pre-runtime-cutover-20261011"
AFTER_PHASE_A = datetime.fromisoformat("2026-10-11T13:04:09.515372+00:00")
READBACK_SHA256 = "9633e3e303e97ca4b4b405af456656c33c1a10a8b179f738ad638a0d9f444bf0"
CHECK_SQL_SHA256 = "eb5d52c1378c539b2a98b4a54a30530f7dce2f768a788ea74e85ad66048ae04c"
EXPECTED_MANIFEST = "656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf"
CHECKS = ("restart_proven", "role_isolation", "prebaseline_fresh",
          "runtime_footprint_clear", "instance_inventory_safe")

class Stop(Exception):
    pass

def require(condition, marker):
    if not condition:
        raise Stop(marker)

def load_bundle():
    root = Path(__file__).resolve().parent
    path = root / "production-database-mixed-acl-read.py"
    require(hashlib.sha256(path.read_bytes()).hexdigest() == READBACK_SHA256, "READBACK_SOURCE_CHANGED")
    spec = importlib.util.spec_from_file_location("phase_a_readback", path)
    preflight = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(preflight)
    operator = preflight.load_operator()
    reader, _ = operator.load_sources()
    sql = operator.checked_file(root / "production-database-runtime-cutover-check.sql", CHECK_SQL_SHA256)
    return operator, reader, preflight, sql

def check_backup(operator, backup_id):
    require(re.fullmatch(r"[1-9][0-9]*", backup_id) is not None, "INVALID_BACKUP_ID")
    backup = json.loads(operator.cloud("sql", "backups", "describe", backup_id,
                                      "--instance=" + operator.INSTANCE, "--format=json"))
    require(str(backup.get("id")) == backup_id and backup.get("instance") == operator.INSTANCE
            and backup.get("type") == "ON_DEMAND" and backup.get("status") == "SUCCESSFUL"
            and backup.get("description") == BACKUP_DESCRIPTION, "CUTOVER_BACKUP_NOT_READY")
    started = datetime.fromisoformat(backup["startTime"].replace("Z", "+00:00"))
    ended = datetime.fromisoformat(backup["endTime"].replace("Z", "+00:00"))
    require(started.tzinfo is not None and ended.tzinfo is not None
            and AFTER_PHASE_A < started <= ended, "BACKUP_PREDATES_PHASE_A")
    require(0 <= (datetime.now(timezone.utc) - ended).total_seconds() <= 3600, "BACKUP_NOT_FRESH")

def control_inventory(operator):
    users = json.loads(operator.cloud("sql", "users", "list",
                                     "--instance=" + operator.INSTANCE, "--format=json"))
    require(isinstance(users, list) and len(users) == 3
            and all(u.get("type", "BUILT_IN") == "BUILT_IN" for u in users)
            and sorted(u.get("name", "") for u in users) == ["khedmah_app", "khedmah_migrator", "postgres"],
            "USER_INVENTORY_CHANGED")
    active = json.loads(operator.cloud("sql", "operations", "list",
                                      "--instance=" + operator.INSTANCE, "--filter=status!=DONE",
                                      "--limit=100", "--format=json"))
    require(active == [], "ANOTHER_SQL_OPERATION_ACTIVE")

def guard(operator, reader, backup_id):
    check_backup(operator, backup_id)
    operator.check_refs(reader)
    control_inventory(operator)

def valid_operation(operation, operator, expected_type, name=None):
    require(isinstance(operation, dict)
            and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}",
                             operation.get("name", "")) is not None
            and operation.get("targetId") == operator.INSTANCE
            and operation.get("targetProject") == operator.PROJECT
            and operation.get("operationType") == expected_type
            and operation.get("status") in ("PENDING", "RUNNING", "DONE")
            and (name is None or operation["name"] == name), "OPERATION_IDENTITY_MISMATCH")
    require(not operation.get("error"), "CONTROL_OPERATION_FAILED")

def mutate(operator, stage, expected_type, *args):
    print("STAGE_ATTEMPT=" + stage, flush=True)
    try:
        operation = json.loads(operator.cloud(*args, "--async", "--quiet", "--format=json"))
        valid_operation(operation, operator, expected_type)
        name = operation["name"]
        print("CONTROL_OPERATION=" + stage + ":" + name, flush=True)
        deadline = time.monotonic() + 900
        while operation["status"] != "DONE":
            require(time.monotonic() < deadline, "CONTROL_OPERATION_WAIT_TIMEOUT")
            time.sleep(3)
            operation = json.loads(operator.cloud("sql", "operations", "describe", name, "--format=json"))
            valid_operation(operation, operator, expected_type, name)
        print("STAGE_DONE=" + stage, flush=True)
    except BaseException:
        print("STAGE_OUTCOME_UNCONFIRMED=" + stage, flush=True)
        print("STOP_DO_NOT_RERUN_REVIEW_LIVE_OPERATIONS", flush=True)
        raise

def postflight_query(operator, user, database, sql, pgpass):
    require((user, database) in (("khedmah_migrator", "khedmah"),
                                ("khedmah_migrator", "postgres"),
                                ("khedmah_migrator", "template1"),
                                ("khedmah_app", "khedmah")), "UNEXPECTED_SQL_TARGET")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
               PGOPTIONS="-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on")
    result = subprocess.run(
        ["psql", "-X", "-w", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", operator.PORT,
         "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-P", "pager=off"],
        input=sql, text=True, capture_output=True, env=env, timeout=120)
    require(result.returncode == 0, "POSTFLIGHT_SQL_FAILED")
    return json.loads(result.stdout)

def validate_postflight(record, user, database):
    require(isinstance(record, dict) and record.get("database") == database
            and record.get("current_user") == user and record.get("session_user") == user
            and record.get("read_only") == "on"
            and record.get("system_role_manifest_sha256") == EXPECTED_MANIFEST
            and all(record.get(key) is True for key in CHECKS), "POSTFLIGHT_NOT_READY")
    require(isinstance(record.get("evidence_utc"), str)
            and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?",
                             record["evidence_utc"]) is not None, "POSTFLIGHT_TIME_INVALID")
    return {key: record[key] for key in ("database", "current_user", "session_user",
            "read_only", "evidence_utc", "system_role_manifest_sha256", *CHECKS)}

def postflight(operator, reader, sql, fence):
    require(re.fullmatch(r"[0-9]{13}", fence) is not None, "RESTART_FENCE_INVALID")
    statement = sql.replace("__RESTART_MILLIS__", fence)
    operator.check_refs(reader)
    with operator.connection() as (pgpass, proxy):
        # Extend the existing private passfile only to the two reviewed databases.
        lines = pgpass.read_text().splitlines()
        migration = next(line for line in lines if ":khedmah:khedmah_migrator:" in line)
        with pgpass.open("a") as output:
            for database in ("postgres", "template1"):
                output.write(migration.replace(":khedmah:khedmah_migrator:",
                                               ":" + database + ":khedmah_migrator:", 1) + "\n")
        del lines, migration
        for user, database in (("khedmah_migrator", "khedmah"), ("khedmah_migrator", "postgres"),
                               ("khedmah_migrator", "template1"), ("khedmah_app", "khedmah")):
            require(proxy.poll() is None, "PROXY_EXITED")
            record = postflight_query(operator, user, database, statement, pgpass)
            print(json.dumps(validate_postflight(record, user, database), sort_keys=True), flush=True)
        operator.check_refs(reader)

def execute(confirmation, backup_id):
    require(confirmation == CONFIRMATION, "SEPARATE_CUTOVER_APPROVAL_REQUIRED")
    os.umask(0o077)
    operator, reader, preflight, sql = load_bundle()
    guard(operator, reader, backup_id)
    with contextlib.redirect_stdout(io.StringIO()) as output:
        preflight.run(operator)
    require("PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION" in output.getvalue(), "PHASE_A_PREFLIGHT_INCOMPLETE")
    print("CUTOVER_PREFLIGHT_PASSED", flush=True)

    guard(operator, reader, backup_id)
    with tempfile.TemporaryDirectory(prefix="khedmah-postgres-containment-") as folder:
        flags = Path(folder) / "password-flags.json"
        flags.write_text(json.dumps({"--password": secrets.token_hex(32)}))
        flags.chmod(0o600)
        mutate(operator, "POSTGRES_CREDENTIAL_CONTAINMENT", "UPDATE_USER",
               "sql", "users", "set-password", "postgres", "--instance=" + operator.INSTANCE,
               "--flags-file=" + str(flags))

    guard(operator, reader, backup_id)
    mutate(operator, "RUNTIME_ROLE_REPLACEMENT", "UPDATE_USER",
           "sql", "users", "assign-roles", "khedmah_app", "--instance=" + operator.INSTANCE,
           "--type=BUILT_IN", "--database-roles=khedmah_runtime_role", "--revoke-existing-roles")

    guard(operator, reader, backup_id)
    runtime = json.loads(operator.cloud("sql", "users", "describe", "khedmah_app",
                                       "--instance=" + operator.INSTANCE, "--format=json"))
    require(runtime.get("name") == "khedmah_app"
            and runtime.get("type", "BUILT_IN") == "BUILT_IN"
            and runtime.get("databaseRoles") == ["khedmah_runtime_role"], "RUNTIME_CONTROL_STATE_NOT_READY")
    fence = str(time.time_ns() // 1_000_000)
    print("RESTART_NOT_BEFORE_MILLIS=" + fence, flush=True)
    mutate(operator, "INSTANCE_RESTART", "RESTART", "sql", "instances", "restart", operator.INSTANCE)
    postflight(operator, reader, sql, fence)
    print("RUNTIME_CUTOVER_AND_ISOLATION_VERIFIED")
    print("SCHEMA_AND_HARDEN_PENDING")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", required=True)
    parser.add_argument("--backup-id", required=True)
    args = parser.parse_args()
    try:
        execute(args.confirm, args.backup_id)
    except Stop as error:
        print("STOP: " + str(error) + "; cutover is not verified; review live state before retry.")
        return 1
    except (Exception, SystemExit, KeyboardInterrupt):
        print("STOP: cutover is not verified; sensitive details withheld; review live state before retry.")
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
