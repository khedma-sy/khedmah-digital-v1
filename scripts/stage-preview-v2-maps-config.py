#!/usr/bin/env python3
"""Stage the verified Preview Maps key privately; never create keys or deploy."""
import datetime
import hmac
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
SECRET = "GOOGLE_MAPS_BROWSER_API_KEY"
PARENT = "projects/" + NUMBER + "/secrets/" + SECRET
KEY_NAME = "projects/" + NUMBER + "/locations/global/keys/khedmah-preview-v2-maps-browser"
KEY_UID = "6fad46fb-229e-403e-8f60-530b4ab9c1ae"
MAPS_API = "maps-backend.googleapis.com"
ORIGIN = "https://khedmah-pr-274-frontend-1044962071847.europe-west1.run.app"


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
                CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                CLOUDSDK_CORE_UNIVERSE_DOMAIN="googleapis.com",
                CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_OPERATION_UNCONFIRMED_RECONCILE_BEFORE_RETRY")
    # Never print command output/errors: a failed operation may contain payloads.
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


def inventory():
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
    return True


def preflight():
    if any(os.environ.get(key) for key in (
            "CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
            "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE")):
        stop("AUTH_OVERRIDE_PRESENT")
    if any(key.startswith("CLOUDSDK_API_ENDPOINT_OVERRIDES_") and value
           for key, value in os.environ.items()):
        stop("API_ENDPOINT_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key).strip() not in (b"", b"(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    # Refuse configured endpoint overrides before transmitting any key.
    endpoints = cloud("config", "list", "api_endpoint_overrides/", fields="api_endpoint_overrides")
    if not isinstance(endpoints, dict) or endpoints.get("api_endpoint_overrides"):
        stop("API_ENDPOINT_OVERRIDE_PRESENT_OR_UNCONFIRMED")
    accounts = cloud("auth", "list", "--filter=account=" + ACCOUNT, fields="account")
    if accounts != [{"account": ACCOUNT}]:
        stop("EXPECTED_ACCOUNT_NOT_AVAILABLE")
    project = cloud("projects", "describe", PROJECT,
                    fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": ORGANIZATION}):
        stop("PROJECT_IDENTITY_MISMATCH")
    if cloud("secrets", "describe", SECRET, fields="name") != {"name": PARENT}:
        stop("SECRET_CONTAINER_MISMATCH")


def verify_maps_key():
    metadata = cloud("services", "api-keys", "describe", KEY_NAME,
                     fields="name,uid,restrictions,deleteTime")
    if (not isinstance(metadata, dict) or metadata.get("name") != KEY_NAME
            or metadata.get("uid") != KEY_UID or metadata.get("deleteTime")):
        stop("MAPS_KEY_IDENTITY_MISMATCH")
    restrictions = metadata.get("restrictions")
    if not isinstance(restrictions, dict) or set(restrictions) != {"apiTargets", "browserKeyRestrictions"}:
        stop("MAPS_KEY_RESTRICTIONS_MISMATCH")
    if restrictions["browserKeyRestrictions"] != {"allowedReferrers": [ORIGIN + "/*"]}:
        stop("MAPS_BROWSER_REFERRERS_MISMATCH")
    targets = restrictions["apiTargets"]
    if (not isinstance(targets, list) or len(targets) != 1 or not isinstance(targets[0], dict)
            or targets[0].get("service") != MAPS_API or targets[0].get("methods", [])
            or set(targets[0]) - {"service", "methods"}):
        stop("MAPS_API_TARGET_MISMATCH")


def verify_maps_api():
    services = cloud("services", "list", "--enabled", "--filter=config.name=" + MAPS_API,
                     fields="config.name")
    if services != [{"config": {"name": MAPS_API}}]:
        stop("MAPS_JAVASCRIPT_API_NOT_VERIFIED_ENABLED")


def read_key():
    # Both stdout and stderr stay captured by cloud(), including on failure.
    value = cloud("services", "api-keys", "get-key-string", KEY_NAME, fields="keyString")
    key = value.get("keyString") if isinstance(value, dict) else None
    if not isinstance(key, str) or not re.fullmatch(r"AIza[0-9A-Za-z_-]{35}", key):
        stop("MAPS_KEY_PAYLOAD_INVALID_NO_WRITE")
    return key.encode("ascii")


def marker_path(directory):
    if directory.is_symlink():
        stop("ATTEMPT_PATH_REJECTED")
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        stop("ATTEMPT_DIRECTORY_NOT_PRIVATE")
    return directory / "version-attempt.json"


def mark_attempt(marker):
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        stop("PREVIOUS_WRITE_ATTEMPT_UNCONFIRMED_RECONCILE")
    with os.fdopen(fd, "w") as stream:
        json.dump({"project": PROJECT, "secret": SECRET, "attempted": True}, stream)
        stream.flush()
        os.fsync(stream.fileno())


def verify_payload(expected):
    if not inventory():
        stop("SECRET_READBACK_UNCONFIRMED_RECONCILE")
    actual = cloud("secrets", "versions", "access", "1", "--secret=" + SECRET)
    if not hmac.compare_digest(actual, expected):
        stop("STORED_VALUE_MISMATCH_NO_OVERWRITE")


def run(directory=None):
    os.umask(0o077)
    preflight()
    verify_maps_key()
    verify_maps_api()
    present = inventory()
    directory = directory or Path.home() / "khedmah-preview-v2-maps-config"
    marker = marker_path(directory)
    if not present and (marker.exists() or marker.is_symlink()):
        stop("PREVIOUS_WRITE_ATTEMPT_UNCONFIRMED_RECONCILE")
    print(json.dumps({"stage": "PREVIEW_V2_MAPS_PREFLIGHT_PASSED",
                      "project": PROJECT, "secret": SECRET,
                      "enabled_version_1_present": present}), flush=True)
    key = read_key()
    created = False
    if not present:
        # A durable local marker prevents blind retries of ambiguous writes.
        # Other cloud writers must be serialized: addVersion has no CAS guard.
        mark_attempt(marker)
        verify_maps_key()
        if not inventory():
            receipt = cloud("secrets", "versions", "add", SECRET, "--data-file=-",
                            fields="name,state", data=key)
            verify_version(receipt)
            created = True
    verify_payload(key)
    verify_maps_key()
    print(json.dumps(dict(stage="PREVIEW_V2_MAPS_CONFIG_STAGED", project=PROJECT,
        secret=SECRET, version="1", created=created, value_verified=True,
        secret_payload_printed=False, key_payload_printed=False,
        key_name=KEY_NAME, key_uid=KEY_UID, key_restrictions_verified=True,
        maps_javascript_api_enabled=True, planned_origin=ORIGIN,
        deployed_origin_verified=False, map_render_verified=False,
        application_deployed=False, floot_connected=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


if __name__ == "__main__":
    # Do not echo unknown arguments, which could accidentally contain a key.
    if sys.argv[1:] != ["--apply"]:
        stop("USE_APPLY_ONLY_NO_KEY_ARGUMENT")
    try:
        run()
    except (OSError, ValueError, TypeError, KeyError, EOFError, KeyboardInterrupt):
        stop("LOCAL_OR_METADATA_FAILURE_RECONCILE")
