#!/usr/bin/env python3
"""Read-only, exact-source Cloud SQL backup candidate gate. Never authorizes restore."""
from datetime import datetime, timezone, timedelta
import json
import os
import subprocess
import sys

PROJECT = "khedmah-preview-v2-20261012"
INSTANCE = "khedmah-preview-v2-db"
REGION = "europe-west1"
DESTINATION_PROJECT = "khedmah-restore-lab-20261112"
MAX_BYTES = 512 * 1024
MAX_AGE = timedelta(hours=48)
QUERY = {
    "instance": ("sql", "instances", "describe", INSTANCE),
    "backups": ("sql", "backups", "list", "--instance=" + INSTANCE, "--limit=25"),
}


def stop(reason):
    raise SystemExit("STOP: " + reason)


def read_cloud(kind):
    if kind not in QUERY:
        stop("READ_SCOPE_NOT_ALLOWED")
    cmd = ["gcloud", "--quiet", *QUERY[kind], "--project=" + PROJECT, "--format=json"]
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1",
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true", CLOUDSDK_CORE_LOG_HTTP="false")
    try:
        p = subprocess.run(cmd, input=b"", stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=45, env=env, check=False)
    except (OSError, subprocess.TimeoutExpired):
        stop("CLOUD_READ_UNAVAILABLE")
    if p.returncode or not p.stdout or len(p.stdout) > MAX_BYTES:
        stop("CLOUD_READ_UNAVAILABLE")
    try:
        return json.loads(p.stdout)
    except (ValueError, UnicodeDecodeError):
        stop("CLOUD_RESPONSE_INVALID")


def timestamp(value):
    if not isinstance(value, str):
        stop("BACKUP_TIMESTAMP_INVALID")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        stop("BACKUP_TIMESTAMP_INVALID")
    if dt.tzinfo is None:
        stop("BACKUP_TIMESTAMP_INVALID")
    return dt.astimezone(timezone.utc)


def classify(instance, backups, now=None):
    if not isinstance(instance, dict):
        stop("SOURCE_INSTANCE_INVALID")
    if (instance.get("name") != INSTANCE or instance.get("region") != REGION
            or instance.get("state") != "RUNNABLE"
            or instance.get("databaseVersion") != "POSTGRES_16"):
        stop("SOURCE_INSTANCE_IDENTITY_MISMATCH")
    settings = instance.get("settings")
    if (not isinstance(settings, dict)
            or not isinstance(settings.get("backupConfiguration"), dict)
            or settings["backupConfiguration"].get("enabled") is not True):
        stop("SOURCE_BACKUPS_NOT_ENABLED")
    if not isinstance(backups, list) or not backups or len(backups) >= 25:
        stop("BACKUP_LIST_MISSING_OR_TRUNCATED")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        stop("CLOCK_INVALID")
    now = now.astimezone(timezone.utc)
    candidates = []
    for backup in backups:
        if not isinstance(backup, dict):
            stop("BACKUP_ENTRY_INVALID")
        if backup.get("type") != "AUTOMATED":
            continue
        if backup.get("status") != "SUCCESSFUL":
            continue
        ident = backup.get("id")
        if not str(ident).isdigit() or ident is None:
            stop("BACKUP_ID_INVALID")
        end = timestamp(backup.get("endTime"))
        age = now - end
        if timedelta(seconds=-600) <= age <= MAX_AGE:
            candidates.append((end, str(ident), age))
    if not candidates:
        stop("NO_RECENT_SUCCESSFUL_AUTOMATED_BACKUP")
    end, ident, age = max(candidates)
    return {
        "source_project": PROJECT, "source_instance": INSTANCE, "source_region": REGION,
        "candidate_backup_id": ident, "candidate_completed_at": end.isoformat(),
        "candidate_age_hours": round(max(0, age.total_seconds()) / 3600, 2),
        "destination_project": DESTINATION_PROJECT,
        "read_only": True, "cloud_resource_mutation": False,
        "source_writer_fenced": False, "target_iam_verified": False,
        "target_network_verified": False, "total_cost_approved": False,
        "restore_authorized": False, "production_release_authorized": False,
        "result": "FRESH_BACKUP_CANDIDATE_ONLY_NO_GO",
    }


def main(argv):
    if argv != ["--inspect"]:
        stop("READ_ONLY_INSPECT_ONLY")
    result = classify(read_cloud("instance"), read_cloud("backups"))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main(sys.argv[1:])
