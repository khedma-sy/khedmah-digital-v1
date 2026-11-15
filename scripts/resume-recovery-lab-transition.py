#!/usr/bin/env python3
"""Resume the existing isolated Khedmah lab and apply the 036/037 transition.

This entrypoint is prepared for an authorized operator; it does not authorize
additional runtime or spending. It never targets preview/production. It only
downloads checksum-pinned repository files, restarts the exact private lab
instance if needed, and invokes the existing guarded transition once.
"""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

PROJECT = "khedmah-restore-lab-20261112"
INSTANCE = "khedmah-restore-pg16-20261114"
REGION = "europe-west1"
NETWORK = f"projects/{PROJECT}/global/networks/khedmah-restore-private"
SOURCE_COMMIT = "20951b4eb991440083a61c611771f7828e440944"
CONFIRM = "RESUME_EXISTING_LAB_AND_APPLY_036_037"
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


def gcloud(args, *, timeout=180, json_output=False):
    cmd = ["gcloud", "--quiet", "--project=" + PROJECT, *args]
    if json_output:
        cmd.append("--format=json")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                                env={**os.environ, "CLOUDSDK_CORE_DISABLE_PROMPTS": "1"})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN") from exc
    if result.returncode:
        raise Stop("LAB_GCLOUD_FAILED")
    if json_output:
        try:
            return json.loads(result.stdout)
        except ValueError as exc:
            raise Stop("LAB_GCLOUD_RESPONSE_INVALID") from exc
    return None


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
    private = [x.get("ipAddress") for x in ips if x.get("type") == "PRIVATE"]
    if not (row.get("project") == PROJECT and row.get("name") == INSTANCE
            and row.get("region") == REGION and row.get("state") == "RUNNABLE"
            and row.get("databaseVersion") == "POSTGRES_16"
            and settings.get("activationPolicy") in ("NEVER", "ALWAYS")
            and ip.get("ipv4Enabled") is False and ip.get("privateNetwork") == NETWORK
            and ip.get("sslMode") == "ENCRYPTED_ONLY" and not ip.get("authorizedNetworks")
            and len(private) == 1 and not any(x.get("type") == "PRIMARY" for x in ips)):
        raise Stop("LAB_INSTANCE_OR_ISOLATION_MISMATCH")
    try:
        if ipaddress.ip_address(private[0]) not in ipaddress.ip_network("10.166.0.0/16"):
            raise Stop("LAB_PRIVATE_ADDRESS_MISMATCH")
    except (TypeError, ValueError) as exc:
        raise Stop("LAB_PRIVATE_ADDRESS_MISMATCH") from exc
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


def require_no_lab_writers():
    # Do this before restart: a pre-existing service or job could reconnect as
    # soon as the instance is started, before the transition's own preflight.
    for kind in ("services", "jobs"):
        rows = gcloud(["run", kind, "list", "--region=" + REGION], json_output=True)
        if not isinstance(rows, list) or rows:
            raise Stop("LAB_EXISTING_RUN_" + kind.upper() + "_REVIEW_REQUIRED")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", default="")
    args = parser.parse_args(argv)
    if args.confirm != CONFIRM:
        print("STOP: EXPLICIT_LAB_AUTHORIZATION_REQUIRED", flush=True)
        return 2
    try:
        with tempfile.TemporaryDirectory(prefix="khedmah-lab-transition-") as directory:
            root = Path(directory)
            stage(root)
            policy = validate_instance(gcloud(["sql", "instances", "describe", INSTANCE], json_output=True))
            require_no_lab_writers()
            if policy == "NEVER":
                print("LAB_RESTART_REQUESTED", flush=True)
                gcloud(["sql", "instances", "patch", INSTANCE, "--activation-policy=ALWAYS"], timeout=900)
            if validate_instance(gcloud(["sql", "instances", "describe", INSTANCE], json_output=True)) != "ALWAYS":
                raise Stop("LAB_RESTART_UNVERIFIED")
            print("LAB_RESTART_VERIFIED", flush=True)
            run_transition(root)
            print("LAB_NEXT_STEP_BACKEND_DEPLOYMENT", flush=True)
            return 0
    except (Stop, OSError) as exc:
        print("STOP:", str(exc) if isinstance(exc, Stop) else "LOCAL_PREPARATION_FAILED", flush=True)
        return 2


if __name__ == "__main__":
    sys.exit(main())
