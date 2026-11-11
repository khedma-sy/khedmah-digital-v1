#!/usr/bin/env python3
"""Read-only regional Cloud Run writer-surface inventory for Khedma Preview V2.

Lists all services and Jobs and the bounded executions for each Job in the
reviewed region. NEVER writes, deploys, enables APIs, reads DB/application rows,
or certifies writer quiescence. Missing/partial inventories fail closed.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
BACKEND = "khedmah-pr-274-backend"
FRONTEND = "khedmah-pr-274-frontend"
MAX_LIST = 1001
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
NAME_PATTERN = re.compile(r"[a-z][a-z0-9-]{0,62}")


def stop(reason):
    raise SystemExit("STOP: " + reason)


def short_name(value):
    if not isinstance(value, str) or NAME_PATTERN.fullmatch(value) is None:
        stop("RESOURCE_NAME_INVALID")
    return value


def resource_name(item, kind, expected_job=None):
    if not isinstance(item, dict):
        stop("RESOURCE_NAME_INVALID")
    metadata = item.get("metadata")
    legacy = metadata.get("name") if isinstance(metadata, dict) else None
    modern = item.get("name")
    if legacy is not None:
        legacy = short_name(legacy)
    if modern is not None:
        if not isinstance(modern, str):
            stop("RESOURCE_NAME_INVALID")
        prefix = "projects/" + PROJECT + "/locations/" + REGION + "/"
        if not modern.startswith(prefix):
            stop("RESOURCE_NAME_INVALID")
        parts = modern[len(prefix):].split("/")
        if kind in ("services", "jobs"):
            valid = len(parts) == 2 and parts[0] == kind
        else:
            valid = (kind == "executions" and len(parts) == 4
                     and parts[0] == "jobs" and parts[2] == "executions")
            if valid:
                short_name(parts[1])
                if expected_job is not None and parts[1] != short_name(expected_job):
                    stop("EXECUTION_PARENT_MISMATCH")
        if not valid:
            stop("RESOURCE_NAME_INVALID")
        modern = short_name(parts[-1])
    if legacy is None and modern is None:
        stop("RESOURCE_NAME_INVALID")
    if legacy is not None and modern is not None and legacy != modern:
        stop("RESOURCE_NAME_CONFLICT")
    return legacy if legacy is not None else modern


def list_names(rows, kind="jobs", expected_job=None):
    if expected_job is not None and kind != "executions":
        stop("COMMAND_SCOPE_REJECTED")
    names = [resource_name(item, kind, expected_job) for item in rows]
    if len(set(names)) != len(names):
        stop("DUPLICATE_RESOURCE_NAME")
    return sorted(names)


def gcloud_list(kind, job=None):
    if kind == "services" and job is None:
        args = ["run", "services", "list"]
    elif kind == "jobs" and job is None:
        args = ["run", "jobs", "list"]
    elif kind == "executions" and job is not None:
        args = ["run", "jobs", "executions", "list", "--job=" + short_name(job)]
    else:
        stop("COMMAND_SCOPE_REJECTED")
    cmd = ["gcloud", *args, "--project=" + PROJECT, "--region=" + REGION,
           "--format=json", "--limit=" + str(MAX_LIST), "--quiet"]
    env = dict(os.environ)
    env.update(CLOUDSDK_CORE_DISABLE_PROMPTS="1",
               CLOUDSDK_CORE_LOG_HTTP="false",
               CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true")
    try:
        proc = subprocess.run(
            cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, timeout=90, env=env, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        stop("CLOUD_READ_FAILED")
    if proc.returncode != 0 or len(proc.stdout) > MAX_OUTPUT_BYTES:
        stop("CLOUD_READ_FAILED")
    try:
        data = json.loads(proc.stdout)
    except (ValueError, UnicodeError):
        stop("CLOUD_RESPONSE_INVALID")
    if not isinstance(data, list) or len(data) >= MAX_LIST:
        stop("INVENTORY_INCOMPLETE_OR_INVALID")
    if not all(isinstance(item, dict) for item in data):
        stop("CLOUD_RESPONSE_INVALID")
    return data


def completion_timestamp_present(item):
    """A completed execution is not necessarily successful (Cloud Run v1/v2)."""
    status = item.get("status")
    legacy = status.get("completionTime") if isinstance(status, dict) else None
    modern = item.get("completionTime")

    for value in (legacy, modern):
        if value is None:
            continue
        if not isinstance(value, str) or "T" not in value:
            stop("EXECUTION_COMPLETION_TIME_INVALID")
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            stop("EXECUTION_COMPLETION_TIME_INVALID")
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            stop("EXECUTION_COMPLETION_TIME_INVALID")

    if legacy is not None and modern is not None and legacy != modern:
        stop("EXECUTION_COMPLETION_TIME_CONFLICT")
    return legacy is not None or modern is not None


def inspect():
    service_names = list_names(gcloud_list("services"), "services")
    if BACKEND not in service_names or FRONTEND not in service_names:
        stop("KNOWN_SERVICE_NOT_ENUMERATED")
    job_names = list_names(gcloud_list("jobs"), "jobs")
    executions = []
    for job in job_names:
        rows = gcloud_list("executions", job)
        names = list_names(rows, "executions", expected_job=job)
        pending = 0
        for item in rows:
            if not completion_timestamp_present(item):
                pending += 1
        executions.append({
            "job": job,
            "listed_execution_count": len(names),
            "nonterminal_or_unknown_count": pending,
            "completion_timestamp_count": len(names) - pending,
            "success_not_inferred_from_completion": True,
        })
    print(json.dumps({
        "stage": "PREVIEW_V2_REGIONAL_WRITER_SURFACES_READ_ONLY",
        "evidence_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "project": PROJECT, "region": REGION,
        "services": service_names,
        "other_service_names": [n for n in service_names if n not in (BACKEND, FRONTEND)],
        "jobs": job_names, "job_execution_summaries": executions,
        "execution_list_limit": MAX_LIST,
        "scheduler_inventoried": False,
        "cloud_tasks_inventoried": False,
        "other_regions_inventoried": False,
        "external_writers_inventoried": False,
        "database_sessions_inventoried": False,
        "writer_quiescence_verified": False,
        "release_authorized": False,
        "schema_mutation": False,
        "database_mutation": False,
        "cloud_resource_mutation": False,
        "traffic_mutation": False,
    }, sort_keys=True))


def main(argv):
    if argv != ["--inspect"]:
        stop("READ_ONLY_INSPECT_ONLY")
    inspect()


if __name__ == "__main__":
    main(sys.argv[1:])
