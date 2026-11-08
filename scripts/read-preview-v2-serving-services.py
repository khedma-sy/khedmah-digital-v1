#!/usr/bin/env python3
"""Read-only observation of actively serving Preview V2 Cloud Run services.

This probe deliberately does NOT implement the stopped-writer gate.
An active backend is compatible with a serving check, but NOT evidence
of writer quiescence, SQL migration eligibility, or a production release.
"""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import re
import sys

_SOURCE = Path(__file__).with_name("read-preview-v2-known-writer-services.py")
_spec = importlib.util.spec_from_file_location("khedmah_known_writer_reader", _SOURCE)
reader = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(reader)

SERVICES = (reader.BACKEND, reader.FRONTEND)
PROJECT = reader.PROJECT
REGION = reader.REGION


def stop(code):
    raise SystemExit("STOP: " + code)


def numeric(value):
    if type(value) is int and value >= 0:
        return value
    if type(value) is str and re.fullmatch(r"(?:0|[1-9][0-9]*)", value):
        return int(value)
    stop("SERVICE_SCALING_INVALID")


def serving_state(raw, service):
    """Project only allowlisted non-secret metadata from a fixed Cloud Run GET."""
    if service not in SERVICES or not isinstance(raw, dict):
        stop("SERVICE_SCOPE_INVALID")
    if raw.get("name") != reader.RESOURCE_PREFIX + service:
        stop("SERVICE_IDENTITY_INVALID")
    if not isinstance(raw.get("uid"), str) or not raw["uid"]:
        stop("SERVICE_UID_INVALID")
    generation, observed = raw.get("generation"), raw.get("observedGeneration")
    if not re.fullmatch(r"[1-9][0-9]*", str(generation)) or str(generation) != str(observed):
        stop("SERVICE_GENERATION_DRIFT")
    if raw.get("reconciling", False) is not False:
        stop("SERVICE_RECONCILING")
    terminal = raw.get("terminalCondition")
    if not isinstance(terminal, dict) or terminal.get("state") != "CONDITION_SUCCEEDED":
        stop("SERVICE_NOT_READY")
    traffic = raw.get("trafficStatuses")
    if not isinstance(traffic, list) or len(traffic) != 1 or not isinstance(traffic[0], dict):
        stop("SERVICE_TRAFFIC_INVALID")
    item = traffic[0]
    if type(item.get("percent")) is not int or item["percent"] != 100:
        stop("SERVICE_TRAFFIC_INVALID")
    if "tag" in item and item["tag"] not in (None, ""):
        stop("SERVICE_TRAFFIC_TAG_PRESENT")
    # A tagged revision with an empty tag field is ambiguous; reject it too.
    if item.get("tag", None) == "":
        stop("SERVICE_TRAFFIC_TAG_PRESENT")
    try:
        serving = reader.revision_name(item.get("revision"), service)
        latest = reader.revision_name(raw.get("latestReadyRevision"), service)
    except SystemExit:
        stop("SERVICE_REVISION_INVALID")
    if serving != latest:
        stop("SERVICE_LATEST_REVISION_DRIFT")
    scaling = raw.get("scaling")
    if not isinstance(scaling, dict):
        stop("SERVICE_SCALING_INVALID")
    mode = scaling.get("scalingMode")
    if mode == "MANUAL":
        count = numeric(scaling.get("manualInstanceCount"))
        scaling_class = "manual_zero" if count == 0 else "manual_nonzero"
    elif mode == "AUTOMATIC":
        if scaling.get("manualInstanceCount") not in (None, ""):
            stop("SERVICE_SCALING_INVALID")
        scaling_class = "automatic"
    else:
        stop("SERVICE_SCALING_INVALID")
    updated = raw.get("updateTime")
    if not isinstance(updated, str) or not updated.endswith("Z"):
        stop("SERVICE_UPDATE_TIME_INVALID")
    try:
        when = dt.datetime.fromisoformat(updated[:-1] + "+00:00")
    except ValueError:
        stop("SERVICE_UPDATE_TIME_INVALID")
    if when > dt.datetime.now(dt.timezone.utc):
        stop("SERVICE_UPDATE_TIME_INVALID")

    # Output deliberately excludes service IDs, images, URLs, credentials,
    # environment variables, UID, raw traffic and any application data.
    return {
        "role": "backend" if service == reader.BACKEND else "frontend",
        "ready": True,
        "serving_latest_untagged_revision": True,
        "scaling_class": scaling_class,
        "revision_matches_historical_backend_pin":
            serving == reader.BACKEND_REVISION if service == reader.BACKEND else None,
        "generation": str(generation),
        "revision": serving,
        "update_time": updated,
    }


def inspect():
    token = reader.access_token()
    passes = []
    for _ in range(2):
        observations = []
        for service in SERVICES:
            observations.append(serving_state(reader.read_service(token, service), service))
        passes.append(observations)
    if passes[0] != passes[1]:
        stop("SERVICE_STATE_DRIFT_DURING_READ")
    print(json.dumps({
        "stage": "PREVIEW_V2_SERVING_CONFIGURATION_READ_ONLY",
        "project_is_pinned_preview": True,
        "region_is_pinned": True,
        "known_services_read_twice": True,
        "services": passes[0],
        "serving_configuration_consistent": True,
        "http_health_checked": False,
        "monitoring_checked": False,
        "database_checked": False,
        "external_writer_sources_checked": False,
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
