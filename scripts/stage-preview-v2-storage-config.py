#!/usr/bin/env python3
"""Stage only the verified replacement Preview bucket name; never deploy."""
import argparse
import datetime
import hmac
import json
import os
from pathlib import Path
import subprocess

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
BUCKET = PROJECT + ".firebasestorage.app"
SECRET = "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
PARENT = "projects/" + NUMBER + "/secrets/" + SECRET


def stop(code):
    raise SystemExit("STOP: " + code)


def cloud(*args, fields=None, data=None):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields is not None:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, input=data if data is not None else b"",
            capture_output=True, timeout=90, env=dict(os.environ,
                CLOUDSDK_CORE_DISABLE_PROMPTS="true", CLOUDSDK_CORE_LOG_HTTP="false",
                CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_OPERATION_UNCONFIRMED_DO_NOT_RETRY_WRITE")
    if result.returncode:
        stop("GCLOUD_" + "_".join(args[:3]).upper().replace("-", "_") + "_FAILED_RECONCILE")
    if fields is None:
        return result.stdout
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop("INVALID_METADATA_RECONCILE")


def verify_version(value):
    if (not isinstance(value, dict) or value.get("name") != PARENT + "/versions/1"
            or value.get("state") != "ENABLED"):
        stop("SECRET_VERSION_CONFLICT_NO_ROTATION")


def observe():
    versions = cloud("secrets", "versions", "list", SECRET, fields="name,state")
    if not isinstance(versions, list):
        stop("INVALID_VERSION_INVENTORY")
    if not versions:
        return False
    if len(versions) != 1:
        stop("SECRET_VERSION_INVENTORY_CONFLICT_NO_ROTATION")
    verify_version(versions[0])
    verify_version(cloud("secrets", "versions", "describe", "1", "--secret=" + SECRET,
                         fields="name,state"))
    actual = cloud("secrets", "versions", "access", "1", "--secret=" + SECRET)
    if not hmac.compare_digest(actual, BUCKET.encode()):
        stop("EXISTING_VALUE_MISMATCH_NO_OVERWRITE")
    return True


def run(directory=None):
    os.umask(0o077)
    if os.environ.get("CLOUDSDK_AUTH_ACCESS_TOKEN"):
        stop("AUTH_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key).strip() not in (b"", b"(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    project = cloud("projects", "describe", PROJECT,
                    fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": ORGANIZATION}):
        stop("PROJECT_IDENTITY_MISMATCH")
    bucket = cloud("storage", "buckets", "describe", "gs://" + BUCKET, "--raw",
                   fields="name,projectNumber,location,iamConfiguration")
    if (not isinstance(bucket, dict) or bucket.get("name") != BUCKET
            or str(bucket.get("projectNumber")) != NUMBER or bucket.get("location") != "EUROPE-WEST1"):
        stop("BUCKET_IDENTITY_MISMATCH")
    iam = bucket.get("iamConfiguration", {})
    if (not isinstance(iam, dict) or iam.get("publicAccessPrevention") != "enforced"
            or not isinstance(iam.get("uniformBucketLevelAccess"), dict)
            or iam["uniformBucketLevelAccess"].get("enabled") is not True):
        stop("BUCKET_PROTECTION_NOT_VERIFIED")
    container = cloud("secrets", "describe", SECRET, fields="name")
    if container != {"name": PARENT}:
        stop("SECRET_CONTAINER_MISMATCH")
    created = False
    if not observe():
        directory = directory or Path.home() / "khedmah-preview-v2-storage-config"
        if directory.is_symlink():
            stop("ATTEMPT_PATH_REJECTED")
        directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        marker = directory / "version-attempt.json"
        # Exclusive durable marker prevents same-host overlap or blind retry
        # after an ambiguous addVersion response. It contains no secret value.
        try:
            with marker.open("x") as stream:
                json.dump({"project": PROJECT, "secret": SECRET, "attempted": True}, stream)
                stream.flush()
                os.fsync(stream.fileno())
        except FileExistsError:
            stop("PREVIOUS_WRITE_ATTEMPT_UNCONFIRMED_RECONCILE")
        # Recheck after winning the local writer marker. Other cloud writers
        # must remain serialized; Secret Manager addVersion has no CAS option.
        if not observe():
            receipt = cloud("secrets", "versions", "add", SECRET, "--data-file=-",
                            fields="name,state", data=BUCKET.encode())
            verify_version(receipt)
            created = True
    if not observe():
        stop("SECRET_READBACK_UNCONFIRMED_RECONCILE")
    print(json.dumps(dict(stage="PREVIEW_V2_STORAGE_CONFIG_STAGED", project=PROJECT,
        secret=SECRET, version="1", created=created, value_verified=True,
        public_access_prevention="enforced", uniform_bucket_level_access=True,
        full_effective_iam_verified=False, all_data_plane_operations_verified=False,
        secret_payload_printed=False, application_deployed=False, floot_connected=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True)
    parser.parse_args()
    try:
        run()
    except (OSError, ValueError, TypeError, KeyError):
        stop("LOCAL_OR_METADATA_FAILURE_RECONCILE")
