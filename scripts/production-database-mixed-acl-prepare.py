#!/usr/bin/env python3
"""Owner-operated Phase A only; backup and explicit operation approval required.

No role/password/secret changes, restart, schema installation or deployment.
A committed first stage is intentionally retained if the second stage fails.
Never rerun blindly after a failure: inspect the safe stage markers and review
the live state. This operator accepts only the initial zero-default-ACL state.
"""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

PROJECT = "khedma-dl"
INSTANCE = "khedmah-v1-db"
CONNECTION = "khedma-dl:europe-west1:khedmah-v1-db"
CONFIRMATION = "PREPARE_KHEDMAH_MIXED_ACL"
BACKUP_DESCRIPTION = "khedmah-pre-mixed-acl-20261011"
READ_SHA256 = "27fb7de4c6a21e010ba09dc5bde582a9b214ba75213645be4ffd6085cb505bc5"
SQL_SHA256 = "845b649bfaae6a1b68093aab0f240f693f323e9c430458a1732186e25ae8e00a"
PORT = "19475"


class Stop(Exception):
    pass


def require(condition, marker):
    if not condition:
        raise Stop(marker)


def cloud(*args):
    result = subprocess.run(
        ["gcloud", *args, "--project=" + PROJECT, "--verbosity=error"],
        capture_output=True, text=True, timeout=60,
        env=dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false"))
    require(result.returncode == 0, "GOOGLE_READ_FAILED")
    return result.stdout


def check_backup(backup_id):
    backup = json.loads(cloud("sql", "backups", "describe", backup_id,
                              "--instance=" + INSTANCE, "--format=json"))
    require(str(backup.get("id")) == backup_id
            and backup.get("instance") == INSTANCE
            and backup.get("type") == "ON_DEMAND"
            and backup.get("status") == "SUCCESSFUL"
            and backup.get("description") == BACKUP_DESCRIPTION,
            "BACKUP_IDENTITY_OR_STATUS_MISMATCH")
    ended = datetime.fromisoformat(backup["endTime"].replace("Z", "+00:00"))
    require(ended.tzinfo is not None, "BACKUP_TIME_INVALID")
    age = (datetime.now(timezone.utc) - ended).total_seconds()
    require(0 <= age <= 3600, "BACKUP_NOT_FRESH")


def check_refs(reader):
    instance = json.loads(cloud("sql", "instances", "describe", INSTANCE, "--format=json"))
    require(instance.get("connectionName") == CONNECTION
            and instance.get("databaseVersion") == "POSTGRES_16"
            and instance.get("state") == "RUNNABLE", "INSTANCE_CHANGED")
    reader.check_secret()
    version = json.loads(cloud("secrets", "versions", "describe", "latest",
                               "--secret=DATABASE_URL", "--format=json"))
    require(version.get("name") == "projects/311026134906/secrets/DATABASE_URL/versions/1"
            and version.get("state") == "ENABLED", "RUNTIME_SECRET_REFERENCE_CHANGED")


def checked_file(path, digest):
    data = path.read_bytes()
    require(hashlib.sha256(data).hexdigest() == digest, "SOURCE_HASH_MISMATCH")
    return data.decode("utf-8")


def load_sources():
    root = Path(__file__).resolve().parent
    read_path = root / "production-database-repair-read.py"
    checked_file(read_path, READ_SHA256)
    sql = checked_file(root / "production-database-mixed-acl-prepare.sql", SQL_SHA256)
    spec = importlib.util.spec_from_file_location("repair_read", read_path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    return reader, sql


def credentials():
    migration = cloud("secrets", "versions", "access", "2", "--secret=DATABASE_MIGRATION_URL")
    match = re.fullmatch(r"postgres(?:ql)?://khedmah_migrator:([0-9a-f]{64})@localhost/khedmah",
                        migration.strip())
    require(match is not None, "MIGRATION_CREDENTIAL_FORMAT_CHANGED")
    raw = cloud("secrets", "versions", "access", "1", "--secret=DATABASE_URL")
    require(raw == raw.strip() and not re.search(r"[\x00-\x20\x7f]", raw)
            and not re.search(r"%(?![0-9a-fA-F]{2})", raw), "RUNTIME_CREDENTIAL_FORMAT_CHANGED")
    url = urlsplit(raw)
    runtime_password = unquote(url.password or "", errors="strict")
    require(url.scheme in ("postgres", "postgresql")
            and unquote(url.username or "", errors="strict") == "khedmah_app"
            and url.path == "/khedmah" and not url.fragment
            and re.fullmatch(r"[0-9a-f]{64}", runtime_password) is not None,
            "RUNTIME_CREDENTIAL_FORMAT_CHANGED")
    # Cloud SQL-attached backend uses the parsed credentials and fixed socket.
    # URL host/query are deliberately never used as connection instructions.
    return {"khedmah_migrator": match.group(1), "khedmah_app": runtime_password}


def sql_call(user, statement, pgpass, *, read_only):
    require(user in ("khedmah_migrator", "khedmah_app"), "UNEXPECTED_SQL_IDENTITY")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
               PGOPTIONS="-c role=none -c search_path=pg_catalog -c default_transaction_read_only="
               + ("on" if read_only else "off"))
    result = subprocess.run(
        ["psql", "-X", "-w", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", PORT,
         "-U", user, "-d", "khedmah", "-v", "ON_ERROR_STOP=1", "-P", "pager=off"],
        input=statement, text=True, capture_output=True, env=env, timeout=90)
    require(result.returncode == 0, "SQL_FAILED_DETAILS_WITHHELD")
    return result.stdout


@contextlib.contextmanager
def connection():
    with tempfile.TemporaryDirectory(prefix="khedmah-acl-prepare-") as folder:
        root = Path(folder)
        values = credentials()
        pgpass = root / "pgpass"
        pgpass.write_text("".join("127.0.0.1:" + PORT + ":khedmah:" + user + ":" + value + "\n"
                                 for user, value in values.items()))
        pgpass.chmod(0o600)
        del values
        log = root / "proxy.log"
        with log.open("w") as output:
            proxy = subprocess.Popen(
                ["/usr/bin/cloud-sql-proxy", CONNECTION, "--address=127.0.0.1", "--port=" + PORT],
                stdout=output, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 45
                while "ready for new connections" not in log.read_text().lower():
                    require(proxy.poll() is None and time.monotonic() < deadline, "PROXY_NOT_READY")
                    time.sleep(0.5)
                require(proxy.poll() is None, "PROXY_EXITED")
                yield pgpass, proxy
            finally:
                if proxy.poll() is None:
                    proxy.terminate()
                    try:
                        proxy.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proxy.kill()
                        proxy.wait()


def execute(confirmation, backup_id):
    # This argument records an already obtained approval, never substitutes for it.
    require(confirmation == CONFIRMATION, "EXPLICIT_OPERATION_APPROVAL_REQUIRED")
    require(re.fullmatch(r"[1-9][0-9]*", backup_id) is not None, "NUMERIC_BACKUP_ID_REQUIRED")
    os.umask(0o077)
    reader, sql = load_sources()
    check_backup(backup_id)
    check_refs(reader)
    with contextlib.redirect_stdout(io.StringIO()) as output:
        reader.run()
    require("PRODUCTION_REPAIR_READ_COMPLETED_NO_MUTATION" in output.getvalue(),
            "READ_PREFLIGHT_INCOMPLETE")
    print("FRESH_READ_PREFLIGHT_PASSED", flush=True)
    with connection() as (pgpass, proxy):
        for user in ("khedmah_migrator", "khedmah_app"):
            identity = sql_call(user, "BEGIN READ ONLY; SELECT current_database() || '|' || "
                                "current_user || '|' || session_user || '|' || "
                                "current_setting('transaction_read_only'); ROLLBACK;",
                                pgpass, read_only=True).strip()
            require(identity == "khedmah|" + user + "|" + user + "|on", "SQL_IDENTITY_CHANGED")
        for user, stage in (("khedmah_migrator", "MIGRATOR_DEFAULTS"),
                            ("khedmah_app", "OWNER_ACL")):
            check_backup(backup_id)
            check_refs(reader)
            require(proxy.poll() is None, "PROXY_EXITED")
            print("STAGE_ATTEMPT=" + stage, flush=True)
            try:
                sql_call(user, sql, pgpass, read_only=False)
            except BaseException:
                print("STAGE_OUTCOME_UNCONFIRMED=" + stage, flush=True)
                print("STOP_DO_NOT_RERUN_REVIEW_LIVE_STATE", flush=True)
                raise
            print("STAGE_COMMITTED=" + stage, flush=True)
        check_refs(reader)
        print("ACL_PREPARATION_COMPLETE_RUNTIME_STILL_PRIVILEGED", flush=True)
        print("NOT_A_COMPLETED_ROLE_REPAIR_OR_DEPLOYMENT", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", required=True)
    parser.add_argument("--backup-id", required=True)
    args = parser.parse_args()
    try:
        execute(args.confirm, args.backup_id)
    except Stop as error:
        print("STOP: " + str(error) + "; inspect stage markers before any retry.")
        return 1
    except (Exception, SystemExit, KeyboardInterrupt):
        print("STOP: operation incomplete; details withheld; inspect stage markers before any retry.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
