#!/usr/bin/env python3
"""Read-only diagnostic for Preview V2 Cloud Run instance-count telemetry.

This script never changes Cloud Run, Monitoring, SQL, IAM, Floot or Production.
It distinguishes an exact-revision filter miss from service-wide telemetry absence.
Missing telemetry remains non-proof of writer quiescence.
"""
import datetime
import json
import subprocess
import sys
import urllib.parse
import urllib.request
import urllib.error

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
REVISION = "khedmah-pr-274-backend-00008-tg8"
METRIC = "run.googleapis.com/container/instance_count"
RESOURCE = "cloud_run_revision"
INSTANCE_RESOURCE = "cloud_run_instance"
BOUNDARY = "2026-10-24T20:40:32Z"
BASE = f"https://monitoring.googleapis.com/v3/projects/{PROJECT}"

def stop(code):
    raise SystemExit("STOP: " + code)

def access_token():
    result = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        text=True, capture_output=True, timeout=60
    )
    if result.returncode != 0:
        stop("MONITORING_TOKEN_FAILED")
    token = result.stdout.strip()
    if not token or any(ch.isspace() for ch in token):
        stop("MONITORING_TOKEN_INVALID")
    return token

def get_json(url, token):
    req = urllib.request.Request(
        url,
        headers={"Authorization": "Bearer " + token, "x-goog-user-project": PROJECT},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return json.loads(response.read(4 * 1024 * 1024))
    except urllib.error.HTTPError as error:
        # Report ONLY a bounded HTTP code. Never log the URL, token or body.
        status = error.code
        error.close()
        if status == 403:
            stop("MONITORING_PERMISSION_DENIED")
        if status in (400, 401, 404, 429):
            stop("MONITORING_HTTP_" + str(status))
        stop("MONITORING_READ_FAILED")
    except Exception:
        stop("MONITORING_READ_FAILED")

def descriptor_url():
    # Cloud Monitoring's metric descriptor resource name is hierarchical:
    # metricDescriptors/run.googleapis.com/container/instance_count
    # Slashes in the metric type must remain path separators.
    return BASE + "/metricDescriptors/" + urllib.parse.quote(METRIC, safe="/")

def resource_descriptor_url(resource=RESOURCE):
    if resource not in (RESOURCE, INSTANCE_RESOURCE):
        stop("RESOURCE_SCOPE_REJECTED")
    return BASE + "/monitoredResourceDescriptors/" + urllib.parse.quote(resource, safe="")

def series_url(token_filter, start, end):
    params = [
        ("filter", token_filter),
        ("interval.startTime", start),
        ("interval.endTime", end),
        ("view", "FULL"),
        ("aggregation.alignmentPeriod", "60s"),
        ("aggregation.perSeriesAligner", "ALIGN_MAX"),
        ("aggregation.crossSeriesReducer", "REDUCE_SUM"),
    ]
    return BASE + "/timeSeries?" + urllib.parse.urlencode(params)

def parse_points(payload, boundary):
    if payload.get("nextPageToken"):
        stop("INSTANCE_METRIC_PAGINATION_UNEXPECTED")
    series = payload.get("timeSeries", [])
    if not isinstance(series, list):
        stop("INSTANCE_METRIC_SHAPE_INVALID")
    points = []
    for row in series:
        rows = row.get("points", [])
        if not isinstance(rows, list):
            stop("INSTANCE_METRIC_SHAPE_INVALID")
        for point in rows:
            end = (point.get("interval") or {}).get("endTime")
            raw = (point.get("value") or {}).get("int64Value")
            if end is None or raw is None:
                continue
            try:
                stamp = datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
                count = int(raw)
            except (TypeError, ValueError):
                stop("INSTANCE_METRIC_SHAPE_INVALID")
            points.append((stamp, count))
    latest = max(points, default=None)
    zeros = [stamp for stamp, count in points if stamp >= boundary and count == 0]
    return {
        "series_count": len(series),
        "point_count": len(points),
        "latest_point_end": latest[0].isoformat() if latest else None,
        "latest_point_value": latest[1] if latest else None,
        "explicit_zero_after_boundary": bool(zeros),
        "latest_zero_end": max(zeros).isoformat() if zeros else None,
    }

def inspect():
    token = access_token()
    boundary = datetime.datetime.fromisoformat(BOUNDARY.replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    end = now.isoformat().replace("+00:00", "Z")
    start = boundary.isoformat().replace("+00:00", "Z")

    metric_desc = get_json(descriptor_url(), token)
    resource_desc = get_json(resource_descriptor_url(), token)
    if metric_desc.get("type") != METRIC:
        stop("METRIC_DESCRIPTOR_MISMATCH")
    if resource_desc.get("type") != RESOURCE:
        stop("RESOURCE_DESCRIPTOR_MISMATCH")

    exact_filter = (
        f'metric.type="{METRIC}" AND resource.type="{RESOURCE}" AND '
        f'resource.labels.service_name="{SERVICE}" AND '
        f'resource.labels.revision_name="{REVISION}" AND '
        f'resource.labels.location="{REGION}"'
    )
    service_filter = (
        f'metric.type="{METRIC}" AND resource.type="{RESOURCE}" AND '
        f'resource.labels.service_name="{SERVICE}" AND '
        f'resource.labels.location="{REGION}"'
    )

    exact = parse_points(get_json(series_url(exact_filter, start, end), token), boundary)
    service = parse_points(get_json(series_url(service_filter, start, end), token), boundary)

    labels = sorted(
        item.get("key") for item in resource_desc.get("labels", [])
        if isinstance(item, dict) and isinstance(item.get("key"), str)
    )
    monitored = sorted(
        item for item in metric_desc.get("monitoredResourceTypes", [])
        if isinstance(item, str)
    )

    # The metric descriptor can advertise cloud_run_instance as well as
    # cloud_run_revision. Inspect it separately to distinguish a resource-type
    # mismatch from genuinely absent telemetry. A missing/malformed label
    # contract does NOT authorize a broader query or a release.
    instance_resource = {
        "resource_type": INSTANCE_RESOURCE,
        "resource_label_keys": [],
        "filter_supported": False,
        "exact_revision_query": None,
        "service_wide_query": None,
    }
    if INSTANCE_RESOURCE in monitored:
        instance_descriptor = get_json(resource_descriptor_url(INSTANCE_RESOURCE), token)
        if instance_descriptor.get("type") != INSTANCE_RESOURCE:
            stop("INSTANCE_RESOURCE_DESCRIPTOR_MISMATCH")
        instance_labels = sorted(
            item.get("key") for item in instance_descriptor.get("labels", [])
            if isinstance(item, dict) and isinstance(item.get("key"), str)
        )
        instance_resource["resource_label_keys"] = instance_labels
        if {"service_name", "revision_name", "location"}.issubset(instance_labels):
            instance_resource["filter_supported"] = True
            instance_base = (
                f'metric.type="{METRIC}" AND resource.type="{INSTANCE_RESOURCE}" AND '
                f'resource.labels.service_name="{SERVICE}" AND '
                f'resource.labels.location="{REGION}"'
            )
            instance_exact_filter = instance_base + (
                f' AND resource.labels.revision_name="{REVISION}"'
            )
            instance_resource["exact_revision_query"] = parse_points(
                get_json(series_url(instance_exact_filter, start, end), token), boundary
            )
            instance_resource["service_wide_query"] = parse_points(
                get_json(series_url(instance_base, start, end), token), boundary
            )

    result = {
        "stage": "PREVIEW_V2_INSTANCE_METRIC_EVIDENCE_READ_COMPLETED",
        "project": PROJECT,
        "region": REGION,
        "service": SERVICE,
        "revision": REVISION,
        "metric": METRIC,
        "boundary_utc": BOUNDARY,
        "metric_kind": metric_desc.get("metricKind"),
        "value_type": metric_desc.get("valueType"),
        "metric_monitored_resource_types": monitored,
        "resource_label_keys": labels,
        "exact_revision_query": exact,
        "service_wide_query": service,
        "instance_resource_diagnostic": instance_resource,
        "instance_resource_zero_point_observed_after_boundary": bool(
            (instance_resource["exact_revision_query"] or {}).get("explicit_zero_after_boundary", False)
        ),
        # This diagnostic reads Monitoring only. Even a zero sample cannot
        # prove stopped database writers, zero revision tags or scaling state.
        "instance_zero_point_observed_after_boundary": bool(exact["explicit_zero_after_boundary"]),
        "service_zero_point_observed_after_boundary": bool(service["explicit_zero_after_boundary"]),
        "writer_quiescence_verified": False,
        "missing_telemetry_is_proof": False,
        "cloud_mutation_performed": False,
        "database_checked": False,
        "release_authorized": False,
    }
    print(json.dumps(result, sort_keys=True))

def main(argv):
    if argv != ["--inspect"]:
        stop("USE_INSPECT_ONLY")
    inspect()

if __name__ == "__main__":
    main(sys.argv[1:])
