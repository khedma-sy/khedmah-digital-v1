#!/usr/bin/env python3
"""Resume the existing isolated Khedmah lab and apply the 036/037 transition.

This entrypoint is prepared for an authorized operator; it does not authorize
additional runtime or spending. It never targets preview/production. It only
downloads checksum-pinned repository files, restarts the exact private lab
instance if needed, and invokes the existing guarded transition once. The
writer-review confirmation is an operator assertion, not proof of isolation;
do not supply it until the external/shared-network and session review is done.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-restore-lab-20261112"
INSTANCE = "khedmah-restore-pg16-20261114"
REGION = "europe-west1"
NETWORK = f"projects/{PROJECT}/global/networks/khedmah-restore-private"
NETWORK_NAME = "khedmah-restore-private"
SOURCE_COMMIT = "20951b4eb991440083a61c611771f7828e440944"
CONFIRM = "RESUME_EXISTING_LAB_AND_APPLY_036_037"
WRITER_REVIEW = "EXTERNAL_WRITERS_AND_SHARED_NETWORK_REVIEWED"
RUNNER_CONFIRM = "APPLY_LAB_ONLY_036_037_AFTER_RESTORE"
SOURCES = {
    "scripts/run-recovery-lab-schema-transition.py": "b7c0494aae106fa9fe32e6706cd2dfe89986a3c7043f8a38048670b586e5fb9f",
    "scripts/run-recovery-lab-catalog-probe.py": "9da8198506d36eb79f83fbe350b9db34d56b0332e5c97f2df195411f225273da",
    "scripts/prepare-preview-v2-approval-transition.py": "6d0e119ed0c4ad137a82ef571e5aefdf376c36675895283f76fcf7f4cb3ca4d5",
    "scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh": "248fad2079180ed751293a36709c4faf65f0872699576a651b8ab4c4d5340230",
    "backend/migrations/versions/025_classifieds.sql": "0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d",
    "backend/migrations/versions/036_classifieds_rolling_publication_quota.sql": "8ed732624b0baf5f5457d138692622214fe2d7b2dd556b79974d23bd0c76093b",
    "backend/migrations/versions/037_verification_evidence_media.sql": "2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216",
}


class Stop(Exception):
    pass


def stage(root):
    for path, expected in SOURCES.items():
        url = f"https://raw.githubusercontent.com/khedma-sy/khedmah-digital-v1/{SOURCE_COMMIT}/{path}"
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = response.read(2_000_001)
        except (OSError, urllib.error.HTTPError) as exc:
            raise Stop("PINNED_SOURCE_DOWNLOAD_FAILED") from exc
        if len(data) > 2_000_000 or hashlib.sha256(data).hexdigest() != expected:
            raise Stop("PINNED_SOURCE_HASH_MISMATCH")
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def safe_gcloud_reason(stderr):
    value = stderr.lower() if isinstance(stderr, str) else ""
    if "permission_denied" in value or "permission denied" in value or "does not have permission" in value:
        return "PERMISSION_DENIED"
    if "service_disabled" in value or "api has not been used" in value or "api is disabled" in value:
        return "SERVICE_DISABLED"
    if "not_found" in value or "not found" in value:
        return "NOT_FOUND"
    if "unreachable" in value or "partial" in value:
        return "PARTIAL_RESPONSE"
    if "quota" in value or "rate limit" in value:
        return "QUOTA_OR_RATE"
    return "UNCLASSIFIED"


def gcloud(args, *, timeout=180, json_output=False):
    cmd = ["gcloud", "--quiet", "--project=" + PROJECT, *args]
    operation = "_".join(str(x).split("=", 1)[0].replace("-", "_").upper()
                         for x in args[:3])
    if json_output:
        cmd.append("--format=json")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                                env={**os.environ, "CLOUDSDK_CORE_DISABLE_PROMPTS": "1"})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN:" + operation) from exc
    if result.returncode:
        raise Stop("LAB_GCLOUD_FAILED:" + operation + ":" + safe_gcloud_reason(result.stderr))
    if json_output:
        # Aggregate list commands may return partial data with a warning and
        # exit 0. Never interpret such an output as a complete empty inventory.
        if result.stderr.strip():
            raise Stop("LAB_GCLOUD_READ_WITH_WARNINGS:" + operation + ":" + safe_gcloud_reason(result.stderr))
        try:
            return json.loads(result.stdout)
        except ValueError as exc:
            raise Stop("LAB_GCLOUD_RESPONSE_INVALID") from exc
    return None


def private_network_is_exact(reference):
    # Google documents both relative references and links. Accept only the
    # exact approved project and network in known API representations.
    return isinstance(reference, str) and reference in {
        NETWORK,
        "/" + NETWORK,
        "https://www.googleapis.com/compute/v1/" + NETWORK,
        "https://compute.googleapis.com/compute/v1/" + NETWORK,
    }


def validate_instance(row):
    if not isinstance(row, dict):
        raise Stop("LAB_INSTANCE_UNVERIFIED")
    settings = row.get("settings") or {}
    if not isinstance(settings, dict):
        raise Stop("LAB_INSTANCE_UNVERIFIED")
    ip = settings.get("ipConfiguration") or {}
    ips = row.get("ipAddresses") or []
    if not isinstance(ip, dict) or not isinstance(ips, list) or not all(isinstance(x, dict) for x in ips):
        raise Stop("LAB_INSTANCE_UNVERIFIED")
    psc = ip.get("pscConfig") or {}
    if not isinstance(psc, dict):
        raise Stop("LAB_INSTANCE_UNVERIFIED")
    private = [x.get("ipAddress") for x in ips if x.get("type") == "PRIVATE"]
    valid_private_address = False
    if len(private) == 1:
        try:
            valid_private_address = ipaddress.ip_address(private[0]) in ipaddress.ip_network("10.166.0.0/16")
        except (TypeError, ValueError):
            pass
    checks = {
        "PROJECT": row.get("project") == PROJECT,
        "INSTANCE": row.get("name") == INSTANCE,
        "REGION": row.get("region") == REGION,
        # Cloud Shell returned STOPPED for the confirmed NEVER-policy lab.
        # Do not accept STOPPED for an ALWAYS-policy instance after restart.
        "STATE": row.get("state") == "RUNNABLE" or (
            row.get("state") == "STOPPED" and settings.get("activationPolicy") == "NEVER"),
        "POSTGRES_VERSION": row.get("databaseVersion") == "POSTGRES_16",
        "ACTIVATION_POLICY": settings.get("activationPolicy") in ("NEVER", "ALWAYS"),
        "PUBLIC_IPV4_DISABLED": ip.get("ipv4Enabled") is False,
        "PRIVATE_NETWORK": private_network_is_exact(ip.get("privateNetwork")),
        "ENCRYPTED_ONLY": ip.get("sslMode") == "ENCRYPTED_ONLY",
        "AUTHORIZED_NETWORKS_EMPTY": ip.get("authorizedNetworks") in (None, []),
        "NO_PRIMARY_ADDRESS": not any(x.get("type") == "PRIMARY" for x in ips),
        "PRIVATE_ADDRESS": valid_private_address,
        "PRIVATE_SERVICE_CONNECT_DISABLED": psc.get("pscEnabled") is None or psc.get("pscEnabled") is False,
        "GOOGLE_PRIVATE_PATH_DISABLED": ip.get("enablePrivatePathForGoogleCloudServices") is None or ip.get("enablePrivatePathForGoogleCloudServices") is False,
        "DATA_API_DISABLED": settings.get("dataApiAccess") in (
            None, "DISALLOW_DATA_API", "DATA_API_ACCESS_UNSPECIFIED"),
    }
    failed = [name for name, ok in checks.items() if not ok]
    if failed:
        # Labels only: never print addresses, raw configuration or credentials.
        raise Stop("LAB_INSTANCE_OR_ISOLATION_MISMATCH:" + ",".join(failed))
    return settings["activationPolicy"]


def run_transition(root):
    runner = root / "scripts/run-recovery-lab-schema-transition.py"
    try:
        result = subprocess.run([sys.executable, str(runner), "--execute", "--confirm", RUNNER_CONFIRM],
                                timeout=1800)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Stop("LAB_TRANSITION_OUTCOME_UNCERTAIN_DO_NOT_RETRY") from exc
    if result.returncode:
        raise Stop("LAB_TRANSITION_STOPPED_DO_NOT_RETRY")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_access_token():
    try:
        result = subprocess.run(["gcloud", "--quiet", "--project=" + PROJECT,
                                 "auth", "print-access-token"],
                                capture_output=True, text=True, timeout=35)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Stop("LAB_GLOBAL_INVENTORY_AUTH_UNAVAILABLE") from exc
    token = result.stdout.strip()
    if result.returncode or not token or any(c.isspace() for c in token):
        raise Stop("LAB_GLOBAL_INVENTORY_AUTH_UNAVAILABLE")
    return token


def global_run_items(token, resource, expected_kind):
    # Cloud Run's v1 global list spans regions and reports unreachable regions.
    # v2 does not support a wildcard region. Never follow a credential redirect.
    paths = {"services": "serving.knative.dev", "jobs": "run.googleapis.com",
             "executions": "run.googleapis.com", "workerpools": "run.googleapis.com"}
    if resource not in paths:
        raise Stop("LAB_GLOBAL_INVENTORY_TARGET_INVALID")
    root = ("https://run.googleapis.com/apis/" + paths[resource] + "/v1/namespaces/"
            + PROJECT + "/" + resource)
    continuation = ""
    seen = set()
    collected = []
    for _ in range(20):
        params = {"limit": "200"}
        if continuation:
            params["continue"] = continuation
        request = urllib.request.Request(root + "?" + urllib.parse.urlencode(params),
                                         headers={"Authorization": "Bearer " + token})
        try:
            opener = urllib.request.build_opener(NoRedirect())
            with opener.open(request, timeout=30) as response:
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise Stop("LAB_GLOBAL_" + resource.upper() + "_RESPONSE_TOO_LARGE")
            data = json.loads(raw)
        except urllib.error.HTTPError as exc:
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_HTTP_" + str(exc.code)) from exc
        except (OSError, ValueError) as exc:
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_UNAVAILABLE") from exc
        # The live Google v1 endpoint reported the singular forms; published
        # API documentation uses the plural forms. Both refer to the same
        # fixed endpoint; version, incomplete pages and reachability still gate.
        kinds = {"JobsList": ("JobsList", "JobList"),
                 "ExecutionsList": ("ExecutionsList", "ExecutionList")}
        accepted_kinds = kinds.get(expected_kind, (expected_kind,))
        if (not isinstance(data, dict) or data.get("kind") not in accepted_kinds
                or data.get("apiVersion") != paths[resource] + "/v1"):
            if not isinstance(data, dict):
                raise Stop("LAB_GLOBAL_" + resource.upper() + "_RESPONSE_NOT_OBJECT")
            kind = safe_api_label(data.get("kind"))
            version = safe_api_label(data.get("apiVersion"))
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_RESPONSE_INVALID:KIND="
                       + kind + ":API_VERSION=" + version)
        unreachable = data.get("unreachable", [])
        rows = data.get("items", [])
        meta = data.get("metadata", {})
        if (not isinstance(unreachable, list) or unreachable
                or not isinstance(rows, list) or not all(isinstance(x, dict) for x in rows)
                or not isinstance(meta, dict)):
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_INCOMPLETE")
        collected.extend(rows)
        if len(collected) > 4000:
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_TOO_MANY_ITEMS")
        continuation = meta.get("continue", "")
        if not isinstance(continuation, str) or len(continuation) > 4096:
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_RESPONSE_INVALID")
        if not continuation:
            return collected
        if continuation in seen:
            raise Stop("LAB_GLOBAL_" + resource.upper() + "_PAGINATION_UNCERTAIN")
        seen.add(continuation)
    raise Stop("LAB_GLOBAL_" + resource.upper() + "_PAGINATION_UNCERTAIN")


def safe_api_label(value):
    # These are provider schema labels only, never resource names or payloads.
    if value is None:
        return "MISSING"
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_./-]{1,80}", value):
        return value
    return "UNEXPECTED"


def diagnose_blockers():
    problems = []
    try:
        row = gcloud(["sql", "instances", "describe", INSTANCE], json_output=True)
        if not isinstance(row, dict) or row.get("project") != PROJECT or row.get("name") != INSTANCE:
            raise Stop("LAB_INSTANCE_IDENTITY_UNVERIFIED")
        settings = row.get("settings") or {}
        if not isinstance(settings, dict):
            raise Stop("LAB_INSTANCE_SETTINGS_UNVERIFIED")
        states = {"RUNNABLE", "SUSPENDED", "PENDING_DELETE", "PENDING_CREATE", "MAINTENANCE",
                  "FAILED", "ONLINE_MAINTENANCE", "REPAIRING", "SQL_INSTANCE_STATE_UNSPECIFIED",
                  "STOPPED", "STOPPING", "UPDATING", "UNKNOWN"}
        state = row.get("state")
        policy = settings.get("activationPolicy")
        print("LAB_SQL_STATE=" + (state if isinstance(state, str) and state in states else "OTHER_OR_MISSING"), flush=True)
        print("LAB_ACTIVATION_POLICY=" + (policy if policy in ("NEVER", "ALWAYS", "ON_DEMAND") else "OTHER_OR_MISSING"), flush=True)
        reasons = row.get("suspensionReason") or []
        allowed = {"SQL_SUSPENSION_REASON_UNSPECIFIED", "BILLING_ISSUE", "LEGAL_ISSUE", "OPERATIONAL_ISSUE", "KMS_KEY_ISSUE"}
        if not isinstance(reasons, list) or not all(isinstance(x, str) and x in allowed for x in reasons):
            raise Stop("LAB_SUSPENSION_REASON_UNVERIFIED")
        print("LAB_SUSPENSION_REASONS=" + (",".join(reasons) if reasons else "NONE_REPORTED"), flush=True)
    except (Stop, OSError) as exc:
        problems.append(str(exc) if isinstance(exc, Stop) else "LAB_SQL_DIAGNOSTIC_FAILED")
    try:
        token = read_access_token()
    except Stop as exc:
        token = None
        problems.append(str(exc))
    if token:
        for resource, kind in (("services", "ServiceList"), ("jobs", "JobsList"),
                               ("executions", "ExecutionsList"), ("workerpools", "WorkerPoolList")):
            try:
                items = global_run_items(token, resource, kind)
                print("LAB_GLOBAL_" + resource.upper() + "_RESULT=" + ("ITEMS_PRESENT" if items else "EMPTY"), flush=True)
            except Stop as exc:
                problems.append(str(exc))
    for problem in problems:
        print("STOP:", problem, flush=True)
    print("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", flush=True)
    print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
    return 2 if problems else 0


def require_no_active_run_executions(token):
    for execution in global_run_items(token, "executions", "ExecutionsList"):
        status = execution.get("status")
        running = status.get("runningCount", 0) if isinstance(status, dict) else None
        if not isinstance(status, dict) or not isinstance(status.get("completionTime"), str) \
                or not status["completionTime"] or type(running) is not int or running != 0:
            raise Stop("LAB_RUN_EXECUTION_ACTIVE_OR_UNKNOWN")
        try:
            ended = datetime.datetime.fromisoformat(status["completionTime"].replace("Z", "+00:00"))
            if ended.tzinfo is None or ended.utcoffset() is None:
                raise ValueError("missing timezone")
        except ValueError as exc:
            raise Stop("LAB_RUN_EXECUTION_ACTIVE_OR_UNKNOWN") from exc


def reject_known_lab_writers(*, collect_all=False):
    # Read-only inspection may collect all independent blockers in one pass.
    # The mutation path remains fail-closed on the first blocker. Neither mode
    # proves external-client isolation or establishes a database writer fence.
    problems = []

    def check(fn):
        try:
            return fn()
        except (Stop, OSError) as exc:
            code = str(exc) if isinstance(exc, Stop) else "LAB_INVENTORY_FAILED"
            if not collect_all:
                raise Stop(code) from exc
            problems.append(code)
            return None

    token = check(read_access_token)
    if token:
        for resource, kind in (("services", "ServiceList"), ("jobs", "JobsList"),
                               ("workerpools", "WorkerPoolList")):
            def no_run_resource(resource=resource, kind=kind):
                if global_run_items(token, resource, kind):
                    raise Stop("LAB_EXISTING_RUN_" + resource.upper() + "_REVIEW_REQUIRED")
            check(no_run_resource)
        check(lambda: require_no_active_run_executions(token))
    for args, label in ((["compute", "instances", "list"], "VMS"),
                        (["compute", "vpn-tunnels", "list"], "VPN"),
                        (["compute", "interconnects", "attachments", "list"], "INTERCONNECT")):
        def no_compute_resource(args=args, label=label):
            rows = gcloud(args, timeout=35, json_output=True)
            if not isinstance(rows, list) or rows:
                raise Stop("LAB_EXISTING_" + label + "_REVIEW_REQUIRED")
        check(no_compute_resource)

    def no_shared_vpc_host():
        project = gcloud(["compute", "project-info", "describe"], timeout=35, json_output=True)
        if (not isinstance(project, dict) or project.get("name") != PROJECT
                or project.get("xpnProjectStatus") not in (None, "UNSPECIFIED_XPN_PROJECT_STATUS")):
            raise Stop("LAB_SHARED_VPC_HOST_REVIEW_REQUIRED")
    check(no_shared_vpc_host)

    def no_scheduler_jobs():
        enabled = gcloud(["services", "list", "--enabled"], timeout=35, json_output=True)
        if (not isinstance(enabled, list) or not enabled
                or not all(isinstance(x, dict) and isinstance(x.get("config"), dict)
                           and isinstance(x["config"].get("name"), str) for x in enabled)):
            raise Stop("LAB_ENABLED_SERVICES_UNVERIFIED")
        names = {x["config"]["name"] for x in enabled}
        if not {"run.googleapis.com", "compute.googleapis.com"}.issubset(names):
            raise Stop("LAB_REQUIRED_SERVICES_UNVERIFIED")
        if "cloudscheduler.googleapis.com" not in names:
            return
        locations = gcloud(["scheduler", "locations", "list"], timeout=35, json_output=True)
        if (not isinstance(locations, list) or not locations or len(locations) > 200
                or not all(isinstance(x, dict) and isinstance(x.get("locationId"), str)
                           and re.fullmatch(r"[a-z]+(?:-[a-z0-9]+)+[0-9]+", x["locationId"])
                           for x in locations)):
            raise Stop("LAB_SCHEDULER_LOCATIONS_UNVERIFIED")
        location_ids = [x["locationId"] for x in locations]
        if len(location_ids) != len(set(location_ids)) or REGION not in location_ids:
            raise Stop("LAB_SCHEDULER_LOCATIONS_UNVERIFIED")
        def scheduler_jobs(location):
            rows = gcloud(["scheduler", "jobs", "list", "--location=" + location], timeout=35, json_output=True)
            if not isinstance(rows, list) or rows:
                raise Stop("LAB_SCHEDULER_JOBS_REVIEW_REQUIRED")
        with ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(scheduler_jobs, location_ids))
    check(no_scheduler_jobs)

    def only_expected_peering():
        network = gcloud(["compute", "networks", "describe", NETWORK_NAME], timeout=35, json_output=True)
        if not isinstance(network, dict) or network.get("name") != NETWORK_NAME:
            raise Stop("LAB_NETWORK_UNVERIFIED")
        peers = network.get("peerings", [])
        if (not isinstance(peers, list) or len(peers) != 1 or not isinstance(peers[0], dict)
                or peers[0].get("name") != "servicenetworking-googleapis-com"
                or peers[0].get("state") != "ACTIVE"):
            raise Stop("LAB_NETWORK_PEERING_REVIEW_REQUIRED")
    check(only_expected_peering)
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inspect", action="store_true", help="read-only stopped-lab inventory")
    parser.add_argument("--diagnose", action="store_true", help="read-only state and Cloud Run response labels")
    parser.add_argument("--confirm", default="")
    parser.add_argument("--confirm-writer-review", default="")
    args = parser.parse_args(argv)
    if args.diagnose:
        if args.inspect or args.confirm or args.confirm_writer_review:
            print("STOP: DIAGNOSE_CANNOT_BE_COMBINED_WITH_EXECUTION", flush=True)
            return 2
        return diagnose_blockers()
    if args.inspect:
        if args.confirm or args.confirm_writer_review:
            print("STOP: INSPECT_CANNOT_BE_COMBINED_WITH_EXECUTION", flush=True)
            return 2
        problems = []
        try:
            policy = validate_instance(gcloud(["sql", "instances", "describe", INSTANCE], json_output=True))
            if policy != "NEVER":
                raise Stop("LAB_NOT_STOPPED_SESSION_BASELINE_UNVERIFIED")
            print("LAB_PRIVATE_CONFIGURATION_VERIFIED=True", flush=True)
            print("LAB_ACTIVATION_POLICY=NEVER", flush=True)
        except (Stop, OSError) as exc:
            problems.append(str(exc) if isinstance(exc, Stop) else "LAB_INSPECTION_FAILED")
        try:
            inventory_problems = reject_known_lab_writers(collect_all=True)
            if inventory_problems:
                problems.extend(inventory_problems)
            else:
                print("LAB_BOUNDED_KNOWN_WRITER_CHECKS=PASS", flush=True)
        except (Stop, OSError) as exc:
            problems.append(str(exc) if isinstance(exc, Stop) else "LAB_INVENTORY_FAILED")
        for problem in problems:
            print("STOP:", problem, flush=True)
        print("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", flush=True)
        print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
        return 2 if problems else 0
    if args.confirm != CONFIRM or args.confirm_writer_review != WRITER_REVIEW:
        print("STOP: EXPLICIT_LAB_AUTHORIZATION_REQUIRED", flush=True)
        return 2
    try:
        with tempfile.TemporaryDirectory(prefix="khedmah-lab-transition-") as directory:
            root = Path(directory)
            stage(root)
            policy = validate_instance(gcloud(["sql", "instances", "describe", INSTANCE], json_output=True))
            # A previously running instance can have existing DB sessions;
            # this wrapper cannot inspect them before restarting.
            if policy != "NEVER":
                raise Stop("LAB_NOT_STOPPED_SESSION_BASELINE_UNVERIFIED")
            reject_known_lab_writers()
            if validate_instance(gcloud(["sql", "instances", "describe", INSTANCE], json_output=True)) != "NEVER":
                raise Stop("LAB_STOPPED_BASELINE_CHANGED")
            print("LAB_RESTART_REQUESTED", flush=True)
            gcloud(["sql", "instances", "patch", INSTANCE, "--activation-policy=ALWAYS"], timeout=900)
            if validate_instance(gcloud(["sql", "instances", "describe", INSTANCE], json_output=True)) != "ALWAYS":
                raise Stop("LAB_RESTART_UNVERIFIED")
            print("LAB_RESTART_VERIFIED", flush=True)
            reject_known_lab_writers()
            run_transition(root)
            print("LAB_NEXT_STEP_BACKEND_DEPLOYMENT", flush=True)
            return 0
    except (Stop, OSError) as exc:
        print("STOP:", str(exc) if isinstance(exc, Stop) else "LOCAL_PREPARATION_FAILED", flush=True)
        return 2


if __name__ == "__main__":
    sys.exit(main())
