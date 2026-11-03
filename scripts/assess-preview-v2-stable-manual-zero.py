#!/usr/bin/env python3
"""Read-only alternative evidence for an already-disabled Preview V2 Cloud Run service.

Never changes Cloud Run, SQL, IAM, traffic, scaling, or releases. Missing
Monitoring series are NOT zero-instance evidence. This is an independent
review candidate, not permission to apply migration 036/037 or to deploy.
Elapsed request timeout is not a substitute for instance lifecycle evidence:
Cloud Run may continue processing a request after returning HTTP 504.
"""
import datetime as dt
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
REVISION = "khedmah-pr-274-backend-00008-tg8"
FULL_SERVICE = f"projects/{PROJECT}/locations/{REGION}/services/{SERVICE}"
FULL_REVISION = f"{FULL_SERVICE}/revisions/{REVISION}"
SERVICE_URL = f"https://run.googleapis.com/v2/{FULL_SERVICE}"
INSPECTOR = "scripts/read-preview-v2-approval-successor-gates.py"
MAX_REQUEST_SECONDS = 3600
SETTLE_SECONDS = 600


def stop(code):
    raise SystemExit("STOP: " + code)


def parse_time(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        stop("TIME_FORMAT_INVALID")
    try:
        parsed = dt.datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        stop("TIME_FORMAT_INVALID")
    if parsed.utcoffset() != dt.timedelta(0):
        stop("TIME_FORMAT_INVALID")
    return parsed


def token():
    try:
        result = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=45,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        stop("CLOUD_TOKEN_UNAVAILABLE")
    if result.returncode or not result.stdout.strip() or any(c.isspace() for c in result.stdout.strip()):
        stop("CLOUD_TOKEN_UNAVAILABLE")
    return result.stdout.strip()


def get_service(access_token):
    request = urllib.request.Request(
        SERVICE_URL, method="GET",
        headers={
            "Authorization": "Bearer " + access_token,
            "x-goog-user-project": PROJECT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read(1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        error.close()
        stop("CLOUD_RUN_GET_FAILED")
    except (OSError, urllib.error.URLError, ValueError):
        stop("CLOUD_RUN_GET_FAILED")
    if len(raw) > 1024 * 1024:
        stop("CLOUD_RUN_RESPONSE_TOO_LARGE")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        stop("CLOUD_RUN_RESPONSE_INVALID")
    if not isinstance(data, dict):
        stop("CLOUD_RUN_RESPONSE_INVALID")
    return data


def service_state(value, now):
    if value.get("name") != FULL_SERVICE:
        stop("SERVICE_IDENTITY_DRIFT")
    if value.get("uid") in (None, ""):
        stop("SERVICE_UID_MISSING")
    generation = str(value.get("generation", ""))
    observed = str(value.get("observedGeneration", ""))
    if not re.fullmatch(r"[1-9][0-9]*", generation) or observed != generation:
        stop("SERVICE_RECONCILIATION_INCOMPLETE")
    if value.get("reconciling", False) is not False:
        stop("SERVICE_RECONCILIATION_INCOMPLETE")
    if (value.get("terminalCondition") or {}).get("state") != "CONDITION_SUCCEEDED":
        stop("SERVICE_CONDITION_NOT_READY")
    scaling = value.get("scaling") or {}
    if scaling.get("scalingMode") != "MANUAL" or str(scaling.get("manualInstanceCount")) != "0":
        stop("SERVICE_NOT_MANUAL_ZERO")
    traffic = value.get("trafficStatuses")
    if not isinstance(traffic, list) or len(traffic) != 1:
        stop("TRAFFIC_INVENTORY_INVALID")
    target = traffic[0]
    if (not isinstance(target, dict) or target.get("revision") != FULL_REVISION
            or target.get("percent") != 100 or target.get("tag")):
        stop("TRAFFIC_OR_TAG_DRIFT")
    if value.get("latestReadyRevision") != FULL_REVISION:
        stop("LATEST_REVISION_DRIFT")
    modified = parse_time(value.get("updateTime"))
    seconds = (now - modified).total_seconds()
    if seconds < MAX_REQUEST_SECONDS + SETTLE_SECONDS:
        stop("SERVICE_ZERO_NOT_SETTLED_LONG_ENOUGH")
    timeout = (value.get("template") or {}).get("timeout")
    # Cloud Run allows at most one hour per request. Do not infer a shorter
    # timeout from an omitted field; use the absolute maximum.
    if timeout is not None:
        if not isinstance(timeout, str) or not re.fullmatch(r"[1-9][0-9]{0,3}s", timeout):
            stop("REQUEST_TIMEOUT_INVALID")
        if int(timeout[:-1]) > MAX_REQUEST_SECONDS:
            stop("REQUEST_TIMEOUT_INVALID")
    return {
        "uid": value["uid"],
        "generation": generation,
        "update_time": value["updateTime"],
        "revision": REVISION,
        "manual_instances": 0,
        "tagged_revision_count": 0,
        "settled_seconds": int(seconds),
    }


def read_successor():
    try:
        result = subprocess.run(
            [sys.executable, INSPECTOR, "--inspect"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=240, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        stop("SUCCESSOR_INSPECTOR_FAILED")
    if result.returncode or len(result.stdout) > 65536:
        stop("SUCCESSOR_INSPECTOR_FAILED")
    try:
        data = json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError):
        stop("SUCCESSOR_RECEIPT_INVALID")
    if not isinstance(data, dict):
        stop("SUCCESSOR_RECEIPT_INVALID")
    return data


def require_zero_snapshot(receipt, start, end):
    if receipt.get("stage") != "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED":
        stop("SUCCESSOR_STAGE_INVALID")
    if receipt.get("project") != PROJECT or receipt.get("region") != REGION:
        stop("SUCCESSOR_TARGET_INVALID")
    observed = parse_time(receipt.get("evidence_utc", "").replace("+00:00", "Z"))
    if not start <= observed <= end:
        stop("SUCCESSOR_SNAPSHOT_NOT_FRESH")
    authority = receipt.get("authority") or {}
    if authority.get("all_granted") is not True or authority.get("policy_troubleshooter_complete") is not True:
        stop("AUTHORITY_NOT_GRANTED")
    service = receipt.get("service_state") or {}
    if (service.get("tagged_revision_count") != 0
            or service.get("latest_ready_revision") != REVISION
            or service.get("serving_revision_count") != 1
            or service.get("template_uses_candidate_image") is not False):
        stop("SUCCESSOR_REVISION_OR_CANDIDATE_DRIFT")
    scaling = service.get("service_scaling") or {}
    if scaling.get("scalingMode") != "MANUAL" or str(scaling.get("manualInstanceCount")) != "0":
        stop("SUCCESSOR_NOT_MANUAL_ZERO")
    traffic = service.get("traffic") or []
    if len(traffic) != 1 or traffic[0].get("revision") != REVISION or traffic[0].get("percent") != 100 or traffic[0].get("tag"):
        stop("SUCCESSOR_TRAFFIC_DRIFT")
    db = receipt.get("database_activity") or {}
    if db.get("read_only") != "on":
        stop("DATABASE_INSPECTION_NOT_READ_ONLY")
    for key in ("runtime_sessions_total", "migrator_sessions_other", "other_sessions_by_identity"):
        if type(db.get(key)) is not int or db[key] != 0:
            stop("DATABASE_WRITERS_NOT_ZERO")
    return {"runtime_sessions_total": 0, "migrator_sessions_other": 0, "other_sessions_by_identity": 0}


def inspect():
    access_token = token()
    start = dt.datetime.now(dt.timezone.utc)
    before = service_state(get_service(access_token), start)
    receipt = read_successor()
    end = dt.datetime.now(dt.timezone.utc)
    after = service_state(get_service(access_token), end)
    if {k: v for k, v in before.items() if k != "settled_seconds"} != {
        k: v for k, v in after.items() if k != "settled_seconds"
    }:
        stop("SERVICE_DRIFT_DURING_SNAPSHOT")
    zero = require_zero_snapshot(receipt, start, end)
    print(json.dumps({
        "stage": "PREVIEW_V2_EXISTING_MANUAL_ZERO_REVIEW_CANDIDATE",
        "project": PROJECT, "region": REGION, "service": SERVICE,
        "manual_zero_read_twice": True,
        "revision_untagged": True,
        "seconds_since_last_update_at_second_read": after["settled_seconds"],
        "minimum_required_settled_seconds": MAX_REQUEST_SECONDS + SETTLE_SECONDS,
        "elapsed_timeout_is_shutdown_proof": False,
        "independent_instance_lifecycle_review_required": True,
        "database_identity_snapshot": zero,
        "missing_monitoring_metrics_are_zero_proof": False,
        "independent_writer_inventory_review_required": True,
        "alternative_evidence_ready_for_review": True,
        "writer_quiescence_verified": False,
        "release_authorized": False,
        "cloud_resource_mutation": False,
        "database_mutation": False,
        "schema_mutation": False,
        "candidate_deployed": False,
    }, sort_keys=True))


def main(argv):
    if argv != ["--inspect"]:
        stop("USE_INSPECT_ONLY")
    inspect()


if __name__ == "__main__":
    main(sys.argv[1:])
