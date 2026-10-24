#!/usr/bin/env python3
"""Preview V2 writer-fence operator.

Default mode is read-only planning. Live execution is fail-closed and requires
an exact confirmation environment variable. This operator NEVER runs 036/037.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
OLD_REVISION = "khedmah-pr-274-backend-00008-tg8"
MAINT_SUFFIX = "wf304"
MAINT_REVISION = SERVICE + "-" + MAINT_SUFFIX
CURRENT_IMAGE = (
    "europe-west1-docker.pkg.dev/khedmah-preview-v2-20261012/"
    "khedmah-preview/backend@sha256:"
    "be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17"
)
CONFIRM_ENV = "KHEDMAH_PREVIEW_WRITER_FENCE_CONFIRM"
CONFIRM_VALUE = "PREVIEW_V2_WRITER_FENCE_20261024"
ROOT = Path(__file__).resolve().parents[1]
INSPECTOR = ROOT / "scripts/read-preview-v2-approval-successor-gates.py"

# No comma inside the JavaScript body: gcloud list parsing then yields exactly
# the two intended args: -e and the source string.
MAINT_JS = (
    'require("http").createServer((...a)=>{'
    'a[1].statusCode=503;'
    'a[1].setHeader("content-type","text/plain");'
    'a[1].end("khedmah-maintenance");'
    '}).listen(process.env.PORT||8080)'
)

def stop(code):
    raise SystemExit("STOP: " + code)

def run(args, check=True):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, timeout=300)
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
    # This is evidence only. It is deliberately not accepted as the fence.
    if db.get("read_only") != "on":
        stop("DB_READ_MODE_INVALID")

def gcloud_base():
    return ["gcloud", "--quiet"]

def revision_exists(name):
    result = run(
        gcloud_base() + [
            "run", "revisions", "describe", name,
            "--project", PROJECT, "--region", REGION, "--format=json",
        ],
        check=False,
    )
    if result.returncode == 0:
        return True
    text = (result.stderr or "") + (result.stdout or "")
    if "NOT_FOUND" in text or "not found" in text.lower():
        return False
    stop("REVISION_EXISTENCE_READ_FAILED")

def deploy_maintenance():
    if revision_exists(MAINT_REVISION):
        stop("MAINTENANCE_REVISION_ALREADY_EXISTS_RECONCILE")
    args = gcloud_base() + [
        "run", "services", "update", SERVICE,
        "--project", PROJECT,
        "--region", REGION,
        "--image", CURRENT_IMAGE,
        "--revision-suffix", MAINT_SUFFIX,
        "--no-traffic",
        "--clear-env-vars",
        "--clear-secrets",
        "--clear-cloudsql-instances",
        "--clear-volumes",
        "--clear-volume-mounts",
        "--command", "node",
        "--args=-e," + MAINT_JS,
        "--format=json",
    ]
    run(args)
    if not revision_exists(MAINT_REVISION):
        stop("MAINTENANCE_REVISION_NOT_CREATED")

def maintenance_revision_is_inert():
    result = run(
        gcloud_base() + [
            "run", "revisions", "describe", MAINT_REVISION,
            "--project", PROJECT, "--region", REGION, "--format=json",
        ]
    )
    try:
        value = json.loads(result.stdout)
    except ValueError:
        stop("MAINTENANCE_REVISION_JSON_INVALID")
    serialized = json.dumps(value, sort_keys=True)
    for forbidden in (
        "DATABASE_URL", "DATABASE_MIGRATION_URL", "cloudsql-instances",
        "secretKeyRef", "secret_key_ref",
    ):
        if forbidden in serialized:
            stop("MAINTENANCE_REVISION_HAS_DATABASE_BINDING")
    if "khedmah-maintenance" not in serialized:
        stop("MAINTENANCE_ENTRYPOINT_NOT_VERIFIED")
    if CURRENT_IMAGE not in serialized and CURRENT_IMAGE.split("@", 1)[1] not in serialized:
        stop("MAINTENANCE_IMAGE_NOT_VERIFIED")

def route_to_maintenance():
    run(gcloud_base() + [
        "run", "services", "update-traffic", SERVICE,
        "--project", PROJECT,
        "--region", REGION,
        "--to-revisions", MAINT_REVISION + "=100",
        "--format=json",
    ])

def receipt_is_maintenance_only(receipt):
    service = receipt.get("service_state", {})
    traffic = service.get("traffic")
    return (
        service.get("tagged_revision_count") == 0
        and service.get("serving_revision_count") == 1
        and isinstance(traffic, list)
        and len(traffic) == 1
        and traffic[0].get("revision") == MAINT_REVISION
        and traffic[0].get("percent") == 100
        and traffic[0].get("tag") is None
    )

def wait_for_database_quiescence():
    # No elapsed-time value is accepted as proof. Every pass requires a fresh
    # live inspector receipt after maintenance owns all service traffic.
    for _ in range(60):
        receipt = read_successor()
        if not receipt_is_maintenance_only(receipt):
            stop("MAINTENANCE_TRAFFIC_NOT_EXCLUSIVE")
        db = receipt.get("database_activity", {})
        if (
            db.get("runtime_sessions_total") == 0
            and db.get("migrator_sessions_other") == 0
            and db.get("other_sessions_by_identity") == 0
        ):
            return receipt
        time.sleep(5)
    stop("DATABASE_WRITERS_DID_NOT_DRAIN")

def list_revisions():
    result = run(gcloud_base() + [
        "run", "revisions", "list",
        "--project", PROJECT,
        "--region", REGION,
        "--service", SERVICE,
        "--format=value(metadata.name)",
    ])
    names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not names:
        stop("REVISION_LIST_EMPTY")
    if len(names) != len(set(names)):
        stop("REVISION_LIST_DUPLICATE")
    return names

def delete_old_revisions():
    names = list_revisions()
    if MAINT_REVISION not in names:
        stop("MAINTENANCE_REVISION_MISSING")
    for name in names:
        if name == MAINT_REVISION:
            continue
        run(gcloud_base() + [
            "run", "revisions", "delete", name,
            "--project", PROJECT,
            "--region", REGION,
        ])
    remaining = list_revisions()
    if remaining != [MAINT_REVISION]:
        stop("OLD_REVISION_RETIREMENT_INCOMPLETE")

def plan():
    return {
        "stage": "PREVIEW_V2_WRITER_FENCE_IMPLEMENTATION_READY_FOR_REVIEW",
        "project": PROJECT,
        "region": REGION,
        "service": SERVICE,
        "old_revision": OLD_REVISION,
        "maintenance_revision": MAINT_REVISION,
        "maintenance_image": CURRENT_IMAGE,
        "maintenance_has_no_application_env_or_secrets": True,
        "maintenance_returns_http_503": True,
        "mutating_mode_requires": {CONFIRM_ENV: CONFIRM_VALUE},
        "execution_sequence": [
            "fresh successor authority/traffic/database read",
            "create maintenance revision with zero traffic and no env/secrets/cloudsql volumes",
            "verify maintenance revision is inert",
            "move 100 percent service traffic to maintenance",
            "poll fresh DB receipts until runtime/migrator/unexpected sessions are all zero",
            "delete all old application revisions",
            "verify maintenance is the only remaining revision",
            "emit writer_quiescence_verified=true receipt",
        ],
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
    deploy_maintenance()
    maintenance_revision_is_inert()
    route_to_maintenance()
    drained = wait_for_database_quiescence()
    delete_old_revisions()
    final = read_successor()
    if not receipt_is_maintenance_only(final):
        stop("FINAL_MAINTENANCE_TRAFFIC_INVALID")
    db = final.get("database_activity", {})
    if not (
        db.get("runtime_sessions_total") == 0
        and db.get("migrator_sessions_other") == 0
        and db.get("other_sessions_by_identity") == 0
    ):
        stop("FINAL_DATABASE_WRITER_PRESENT")
    if list_revisions() != [MAINT_REVISION]:
        stop("FINAL_REVISION_SET_INVALID")
    print(json.dumps({
        "stage": "PREVIEW_V2_WRITER_FENCE_VERIFIED",
        "project": PROJECT,
        "service": SERVICE,
        "maintenance_revision": MAINT_REVISION,
        "writer_quiescence_verified": True,
        "runtime_sessions_total": db.get("runtime_sessions_total"),
        "migrator_sessions_other": db.get("migrator_sessions_other"),
        "other_sessions_by_identity": db.get("other_sessions_by_identity"),
        "old_application_revisions_retired": True,
        "migrations_executed": False,
        "candidate_deployed": False,
        "production_mutation": False,
        "floot_gate_activation": False,
        "pre_drain_evidence_utc": drained.get("evidence_utc"),
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
