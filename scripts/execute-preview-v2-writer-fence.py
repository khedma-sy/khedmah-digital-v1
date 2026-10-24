#!/usr/bin/env python3
"""Preview V2 writer-fence operator.

Default mode is read-only planning. Live execution is fail-closed and requires
an exact confirmation environment variable. This operator NEVER runs 036/037.
"""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
OLD_REVISION = "khedmah-pr-274-backend-00008-tg8"
CONFIRM_ENV = "KHEDMAH_PREVIEW_WRITER_FENCE_CONFIRM"
CONFIRM_VALUE = "PREVIEW_V2_WRITER_FENCE_20261024"
ROOT = Path(__file__).resolve().parents[1]
INSPECTOR = ROOT / "scripts/read-preview-v2-approval-successor-gates.py"
MONITORING_URL = "https://monitoring.googleapis.com/v3/projects/" + PROJECT + "/timeSeries"
METRIC = "run.googleapis.com/container/instance_count"

def stop(code):
    raise SystemExit("STOP: " + code)

def run(args, check=True, timeout=300):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    if check and result.returncode != 0:
        stop("COMMAND_FAILED")
    return result

def read_successor():
    result = run([sys.executable, str(INSPECTOR), "--inspect"])
    try:
        value = json.loads(result.stdout)
    except (ValueError, TypeError):
        stop("SUCCESSOR_RECEIPT_INVALID")
    if value.get("stage") != "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED":
        stop("SUCCESSOR_STAGE_INVALID")
    return value

def require_preflight(receipt):
    authority = receipt.get("authority", {})
    service = receipt.get("service_state", {})
    db = receipt.get("database_activity", {})
    if authority.get("all_granted") is not True:
        stop("AUTHORITY_NOT_GRANTED")
    if service.get("tagged_revision_count") != 0:
        stop("TAGGED_REVISION_PRESENT")
    if service.get("serving_revision_count") != 1:
        stop("SERVING_REVISION_COUNT_INVALID")
    traffic = service.get("traffic")
    if not isinstance(traffic, list) or len(traffic) != 1:
        stop("TRAFFIC_INVALID")
    if traffic[0].get("revision") != OLD_REVISION or traffic[0].get("percent") != 100:
        stop("SERVING_REVISION_DRIFT")
    if service.get("latest_ready_revision") != OLD_REVISION:
        stop("LATEST_READY_DRIFT")
    if service.get("runtime_service_account_matches") is not True:
        stop("RUNTIME_IDENTITY_DRIFT")
    if db.get("read_only") != "on":
        stop("DB_READ_MODE_INVALID")

def disable_service():
    result = run([
        "gcloud", "--quiet", "run", "services", "update", SERVICE,
        "--project", PROJECT,
        "--region", REGION,
        "--scaling=0",
        "--format=json",
    ])
    try:
        value = json.loads(result.stdout)
    except ValueError:
        stop("DISABLE_RESPONSE_INVALID")
    scaling = value.get("scaling") or {}
    annotations = ((value.get("metadata") or {}).get("annotations") or {})
    mode = scaling.get("scalingMode")
    count = scaling.get("manualInstanceCount")
    # gcloud may normalize the Cloud Run v2 service into the Knative/v1-style
    # annotation shape even when the mutation itself succeeded. Accept only
    # the exact equivalent manual-zero state; never infer success from absence.
    if mode is None and count is None:
        mode = annotations.get("run.googleapis.com/scalingMode")
        count = annotations.get("run.googleapis.com/manualInstanceCount")
    if str(mode).upper() != "MANUAL":
        stop("SERVICE_NOT_MANUAL_ZERO")
    if str(count) not in ("0", "0.0"):
        stop("SERVICE_NOT_MANUAL_ZERO")
    for row in (value.get("trafficStatuses") or (value.get("status") or {}).get("traffic") or []):
        if row.get("tag"):
            stop("TAGGED_REVISION_PRESENT_AFTER_DISABLE")
    return datetime.datetime.now(datetime.timezone.utc)

def access_token():
    result = run(["gcloud", "auth", "print-access-token"], timeout=60)
    token = result.stdout.strip()
    if not token or any(ch.isspace() for ch in token):
        stop("MONITORING_TOKEN_INVALID")
    return token

def monitoring_instance_count(disabled_at):
    # Cloud Monitoring samples this metric every 60s and can delay visibility.
    # We require an explicit zero point after disable time. Missing data is never proof.
    end = datetime.datetime.now(datetime.timezone.utc)
    start = disabled_at - datetime.timedelta(minutes=2)
    filt = (
        'metric.type="' + METRIC + '" AND '
        'resource.type="cloud_run_revision" AND '
        'resource.labels.service_name="' + SERVICE + '" AND '
        'resource.labels.revision_name="' + OLD_REVISION + '" AND '
        'resource.labels.location="' + REGION + '"'
    )
    params = [
        ("filter", filt),
        ("interval.startTime", start.isoformat().replace("+00:00", "Z")),
        ("interval.endTime", end.isoformat().replace("+00:00", "Z")),
        ("view", "FULL"),
        ("aggregation.alignmentPeriod", "60s"),
        ("aggregation.perSeriesAligner", "ALIGN_MAX"),
        ("aggregation.crossSeriesReducer", "REDUCE_SUM"),
    ]
    url = MONITORING_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer " + access_token(),
            "x-goog-user-project": PROJECT,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read(4 * 1024 * 1024))
    except Exception:
        stop("INSTANCE_METRIC_READ_FAILED")
    if data.get("nextPageToken"):
        stop("INSTANCE_METRIC_PAGINATION_UNEXPECTED")
    series = data.get("timeSeries", [])
    if not isinstance(series, list) or len(series) > 1:
        stop("INSTANCE_METRIC_SHAPE_INVALID")
    explicit_zero = False
    latest_end = None
    if series:
        points = series[0].get("points", [])
        if not isinstance(points, list):
            stop("INSTANCE_METRIC_SHAPE_INVALID")
        for point in points:
            interval_end = (point.get("interval") or {}).get("endTime")
            value = point.get("value") or {}
            raw = value.get("int64Value")
            if interval_end is None or raw is None:
                continue
            try:
                ts = datetime.datetime.fromisoformat(interval_end.replace("Z", "+00:00"))
                count = int(raw)
            except (ValueError, TypeError):
                stop("INSTANCE_METRIC_SHAPE_INVALID")
            if latest_end is None or ts > latest_end:
                latest_end = ts
            if ts >= disabled_at and count == 0:
                explicit_zero = True
    return {"explicit_zero_after_disable": explicit_zero, "latest_point_end": latest_end}

def wait_for_instance_zero(disabled_at):
    # Up to ~6 minutes, covering the documented sampling+visibility lag.
    for _ in range(24):
        evidence = monitoring_instance_count(disabled_at)
        if evidence["explicit_zero_after_disable"]:
            return evidence
        time.sleep(15)
    stop("INSTANCE_ZERO_NOT_PROVEN")

def final_database_zero():
    receipt = read_successor()
    service = receipt.get("service_state", {})
    if service.get("tagged_revision_count") != 0:
        stop("TAGGED_REVISION_PRESENT_FINAL")
    scaling = service.get("service_scaling") or {}
    if scaling.get("scalingMode") != "MANUAL":
        stop("SERVICE_NOT_DISABLED_FINAL")
    if str(scaling.get("manualInstanceCount")) not in ("0", "0.0"):
        stop("SERVICE_NOT_DISABLED_FINAL")
    db = receipt.get("database_activity", {})
    if not (
        db.get("runtime_sessions_total") == 0
        and db.get("migrator_sessions_other") == 0
        and db.get("other_sessions_by_identity") == 0
    ):
        stop("FINAL_DATABASE_WRITER_PRESENT")
    return receipt

def plan():
    return {
        "stage": "PREVIEW_V2_WRITER_FENCE_IMPLEMENTATION_READY_FOR_REVIEW",
        "project": PROJECT,
        "region": REGION,
        "service": SERVICE,
        "serving_revision": OLD_REVISION,
        "mutating_mode_requires": {CONFIRM_ENV: CONFIRM_VALUE},
        "execution_sequence": [
            "fresh successor authority/traffic/database read",
            "disable the entire Cloud Run service with manual scaling zero",
            "require zero revision tags",
            "wait for an explicit Cloud Monitoring container instance_count zero point after disable",
            "re-read database activity and require runtime/migrator/unexpected sessions all zero",
            "emit writer_quiescence_verified=true receipt",
        ],
        "missing_monitoring_data_is_proof": False,
        "elapsed_time_alone_is_proof": False,
        "migrations_executed": False,
        "candidate_deployed": False,
        "production_mutation": False,
        "floot_gate_activation": False,
        "execution_enabled_by_default": False,
    }

def execute():
    if os.environ.get(CONFIRM_ENV) != CONFIRM_VALUE:
        stop("EXPLICIT_FENCE_CONFIRMATION_REQUIRED")
    pre = read_successor()
    require_preflight(pre)
    disabled_at = disable_service()
    metric = wait_for_instance_zero(disabled_at)
    final = final_database_zero()
    print(json.dumps({
        "stage": "PREVIEW_V2_WRITER_FENCE_VERIFIED",
        "project": PROJECT,
        "service": SERVICE,
        "serving_revision": OLD_REVISION,
        "service_disabled_manual_zero": True,
        "instance_count_zero_explicit_after_disable": True,
        "instance_metric_latest_point_end": (
            metric["latest_point_end"].isoformat()
            if metric["latest_point_end"] is not None else None
        ),
        "writer_quiescence_verified": True,
        "runtime_sessions_total": final["database_activity"].get("runtime_sessions_total"),
        "migrator_sessions_other": final["database_activity"].get("migrator_sessions_other"),
        "other_sessions_by_identity": final["database_activity"].get("other_sessions_by_identity"),
        "migrations_executed": False,
        "candidate_deployed": False,
        "production_mutation": False,
        "floot_gate_activation": False,
        "final_evidence_utc": final.get("evidence_utc"),
    }, sort_keys=True))

def main(argv):
    if argv == ["--plan"]:
        print(json.dumps(plan(), sort_keys=True))
        return
    if argv == ["--execute-fence"]:
        execute()
        return
    stop("USE_PLAN_OR_EXPLICIT_EXECUTE_FENCE")

if __name__ == "__main__":
    main(sys.argv[1:])
