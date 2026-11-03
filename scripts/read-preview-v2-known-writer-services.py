#!/usr/bin/env python3
"""Inspect both known Preview V2 Cloud Run services with read-only WIF.

This inventory is NOT a writer-quiescence proof. It does not enumerate Cloud
Run jobs, Cloud Tasks, Scheduler, SQL connections, or external writers and
never authorizes a migration or service deployment.
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
BACKEND = "khedmah-pr-274-backend"
FRONTEND = "khedmah-pr-274-frontend"
BACKEND_REVISION = "khedmah-pr-274-backend-00008-tg8"
SERVICES = (BACKEND, FRONTEND)
API_PREFIX = f"https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/services/"
RESOURCE_PREFIX = f"projects/{PROJECT}/locations/{REGION}/services/"
MAX_RESPONSE = 1024 * 1024


def stop(code):
    raise SystemExit("STOP: " + code)


def access_token():
    try:
        result = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
            check=False, timeout=45,
        )
    except (OSError, subprocess.SubprocessError):
        stop("READONLY_TOKEN_UNAVAILABLE")
    token = result.stdout.strip()
    if result.returncode or not token or any(ch.isspace() for ch in token):
        stop("READONLY_TOKEN_UNAVAILABLE")
    return token


class DenyRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_service(token, service):
    if service not in SERVICES:
        stop("SERVICE_READ_SCOPE_REJECTED")
    url = API_PREFIX + service
    request = urllib.request.Request(
        url, method="GET", headers={
            "Authorization": "Bearer " + token, "x-goog-user-project": PROJECT,
        },
    )
    try:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), DenyRedirect()
        )
        with opener.open(request, timeout=45) as response:
            raw = response.read(MAX_RESPONSE + 1)
    except urllib.error.HTTPError as error:
        error.close()
        stop("SERVICE_READ_DENIED_OR_FAILED")
    except (OSError, urllib.error.URLError, ValueError):
        stop("SERVICE_READ_DENIED_OR_FAILED")
    if len(raw) > MAX_RESPONSE:
        stop("SERVICE_READ_RESPONSE_TOO_LARGE")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        stop("SERVICE_READ_RESPONSE_INVALID")
    if not isinstance(data, dict):
        stop("SERVICE_READ_RESPONSE_INVALID")
    return data


def revision_name(value, service):
    if not isinstance(value, str) or service not in SERVICES:
        stop("REVISION_INVENTORY_INVALID")
    prefix = RESOURCE_PREFIX + service + "/revisions/"
    short = value[len(prefix):] if value.startswith(prefix) else value
    if re.fullmatch(re.escape(service) + r"-[0-9]{5}-[a-z0-9]+", short) is None:
        stop("REVISION_INVENTORY_INVALID")
    if short == value and value.startswith("projects/"):
        stop("REVISION_INVENTORY_INVALID")
    return short


def inspect_service(value, service):
    if service not in SERVICES or value.get("name") != RESOURCE_PREFIX + service:
        stop("SERVICE_IDENTITY_MISMATCH")
    uid, generation = value.get("uid"), value.get("generation")
    observed = value.get("observedGeneration")
    if not isinstance(uid, str) or not uid or not re.fullmatch(r"[1-9][0-9]*", str(generation)):
        stop("SERVICE_GENERATION_INVALID")
    if str(generation) != str(observed) or value.get("reconciling", False) is not False:
        stop("SERVICE_RECONCILIATION_PENDING")
    terminal = value.get("terminalCondition")
    if not isinstance(terminal, dict) or terminal.get("state") != "CONDITION_SUCCEEDED":
        stop("SERVICE_TERMINAL_CONDITION_INVALID")
    scaling = value.get("scaling")
    if not isinstance(scaling, dict) or scaling.get("scalingMode") != "MANUAL":
        stop("SERVICE_NOT_MANUAL_ZERO")
    if str(scaling.get("manualInstanceCount")) != "0":
        stop("SERVICE_NOT_MANUAL_ZERO")
    traffic = value.get("trafficStatuses")
    if not isinstance(traffic, list) or len(traffic) != 1:
        stop("SERVICE_TRAFFIC_INVALID")
    item = traffic[0]
    if not isinstance(item, dict) or type(item.get("percent")) is not int or item["percent"] != 100:
        stop("SERVICE_TRAFFIC_INVALID")
    if item.get("tag") not in (None, ""):
        stop("TAGGED_REVISION_PRESENT")
    if item.get("tag") == "":
        stop("TAGGED_REVISION_PRESENT")
    target = revision_name(item.get("revision"), service)
    latest = revision_name(value.get("latestReadyRevision"), service)
    if target != latest:
        stop("LATEST_SERVING_REVISION_MISMATCH")
    if service == BACKEND and target != BACKEND_REVISION:
        stop("BACKEND_REVISION_DRIFT")
    update_time = value.get("updateTime")
    if not isinstance(update_time, str) or not update_time.endswith("Z"):
        stop("SERVICE_UPDATE_TIME_INVALID")
    try:
        updated = dt.datetime.fromisoformat(update_time[:-1] + "+00:00")
    except ValueError:
        stop("SERVICE_UPDATE_TIME_INVALID")
    if updated > dt.datetime.now(dt.timezone.utc):
        stop("SERVICE_UPDATE_TIME_INVALID")
    # No potentially sensitive fields, template or URLs are printed.
    return {
        "service": service, "uid": uid,
        "generation": str(generation),
        "revision": target,
        "update_time": update_time,
        "manual_zero": True,
        "no_tagged_traffic": True,
        "one_serving_revision": True,
    }


def inspect():
    token = access_token()
    first = {service: inspect_service(read_service(token, service), service)
             for service in SERVICES}
    second = {service: inspect_service(read_service(token, service), service)
              for service in SERVICES}
    if first != second:
        stop("WRITER_SERVICE_STATE_DRIFT")
    print(json.dumps({
        "stage": "PREVIEW_V2_KNOWN_SERVICES_READ_ONLY",
        "project": PROJECT, "region": REGION,
        "backend": {k: first[BACKEND][k] for k in
                    ("service", "revision", "manual_zero", "no_tagged_traffic")},
        "frontend": {k: first[FRONTEND][k] for k in
                     ("service", "revision", "manual_zero", "no_tagged_traffic")},
        "known_service_count": 2,
        "known_services_read_twice": True,
        "other_cloud_run_services_enumerated": False,
        "cloud_run_jobs_checked": False,
        "cloud_scheduler_checked": False,
        "cloud_tasks_checked": False,
        "external_writer_sources_checked": False,
        "database_checked": False,
        "writer_quiescence_verified": False,
        "release_authorized": False,
        "cloud_resource_mutation": False,
        "database_mutation": False,
    }, sort_keys=True))


def main(argv):
    if argv != ["--inspect"]:
        stop("READ_ONLY_INSPECT_ONLY")
    inspect()


if __name__ == "__main__":
    main(sys.argv[1:])
