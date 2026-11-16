#!/usr/bin/env python3
"""Read-only, bounded checks for remaining lab network paths; no fencing claim.

Uses the caller's existing gcloud credential and GET requests only. Never
prints bearer tokens, resource names, addresses, raw API responses, or data.
Asset Inventory results are eventual snapshots, not proof of absence. This
tool does not start Cloud SQL or verify database sessions or future writers.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-restore-lab-20261112"
PROJECT_NUMBER = "36942020932"
SHELL_QUOTA_PROJECT = "khedma-dl-e409d"
REGION = "europe-west1"
NCC = "https://networkconnectivity.googleapis.com/v1/projects/" + PROJECT + "/locations/global/spokes"
VPC = "https://vpcaccess.googleapis.com/v1/projects/" + PROJECT + "/locations"
APP = "https://appengine.googleapis.com/v1/apps/" + PROJECT
ASSET = "https://cloudasset.googleapis.com/v1/projects/" + PROJECT + "/assets"
SERVICE_USAGE = "https://serviceusage.googleapis.com/v1/projects/" + PROJECT_NUMBER + "/services/"
REASONS = frozenset(("SERVICE_DISABLED", "IAM_PERMISSION_DENIED", "CONSUMER_INVALID",
                     "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "BILLING_DISABLED"))
ASSET_TYPES = {
    "networkconnectivity.googleapis.com/Spoke": "NCC",
    "vpcaccess.googleapis.com/Connector": "CONNECTORS",
    "appengine.googleapis.com/Application": "APP_ENGINE",
}


class Unavailable(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def token():
    try:
        result = subprocess.run(["gcloud", "auth", "print-access-token", "--quiet"],
                                capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Unavailable("AUTH_UNAVAILABLE") from exc
    value = result.stdout.strip()
    if result.returncode or not value or any(ch.isspace() for ch in value):
        raise Unavailable("AUTH_UNAVAILABLE")
    return value


def read_json(url, access_token, quota_project=None):
    if quota_project not in (None, SHELL_QUOTA_PROJECT):
        raise Unavailable("QUOTA_PROJECT_UNEXPECTED")
    headers = {"Authorization": "Bearer " + access_token}
    if quota_project:
        # Only the quota/consumer changes. Resource paths remain pinned to LAB.
        headers["x-goog-user-project"] = quota_project
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
            data = response.read(2_000_001)
    except urllib.error.HTTPError as exc:
        reason = ""
        if exc.code == 403:
            try:
                payload = json.loads(exc.read(65537))
                details = payload.get("error", {}).get("details", [])
                matches = {x.get("reason") for x in details
                           if isinstance(x, dict)
                           and x.get("@type") == "type.googleapis.com/google.rpc.ErrorInfo"
                           and x.get("domain") == "googleapis.com"
                           and x.get("reason") in REASONS}
                if len(matches) == 1:
                    reason = "_" + matches.pop()
            except (ValueError, TypeError, AttributeError, OSError):
                pass
        raise Unavailable("HTTP_" + str(exc.code) + reason) from exc
    except (OSError, ValueError) as exc:
        raise Unavailable("UNAVAILABLE") from exc
    if len(data) > 2_000_000:
        raise Unavailable("RESPONSE_TOO_LARGE")
    try:
        value = json.loads(data)
    except (ValueError, UnicodeDecodeError) as exc:
        raise Unavailable("RESPONSE_INVALID") from exc
    if not isinstance(value, dict):
        raise Unavailable("RESPONSE_INVALID")
    return value


def pages(url, field, access_token, params=(), quota_project=None):
    found, seen, cursor = [], set(), ""
    for _ in range(100):
        query = list(params) + [("pageSize", "100")]
        if cursor:
            query.append(("pageToken", cursor))
        target = url + "?" + urllib.parse.urlencode(query)
        body = (read_json(target, access_token, quota_project=quota_project)
                if quota_project else read_json(target, access_token))
        items = body.get(field, [])
        if ("error" in body or not isinstance(items, list) or not all(isinstance(x, dict) for x in items)
                or body.get("unreachable") not in (None, [])):
            raise Unavailable("INCOMPLETE_OR_INVALID")
        found.extend(items)
        cursor = body.get("nextPageToken", "")
        if not isinstance(cursor, str):
            raise Unavailable("PAGINATION_INVALID")
        if not cursor:
            return found
        if len(cursor) > 4096 or cursor in seen:
            raise Unavailable("PAGINATION_INVALID")
        seen.add(cursor)
    raise Unavailable("PAGINATION_LIMIT")


def connectors(access_token, quota_project=None):
    locations = pages(VPC, "locations", access_token, quota_project=quota_project)
    ids = [row.get("locationId") for row in locations]
    if (not ids or len(ids) > 200
            or not all(isinstance(x, str) and re.fullmatch(r"[a-z]+(?:-[a-z0-9]+)+[0-9]+", x)
                       for x in ids)
            or REGION not in ids or len(ids) != len(set(ids))):
        raise Unavailable("LOCATIONS_INVALID")
    def one(region):
        return pages(VPC + "/" + region + "/connectors", "connectors", access_token,
                     quota_project=quota_project)
    with ThreadPoolExecutor(max_workers=8) as executor:
        return sum(len(rows) for rows in executor.map(one, ids))


def snapshot(access_token):
    rows = pages(ASSET, "assets", access_token,
                 [("assetTypes", name) for name in ASSET_TYPES])
    counts = {label: 0 for label in ASSET_TYPES.values()}
    for row in rows:
        kind = row.get("assetType")
        if kind not in ASSET_TYPES:
            raise Unavailable("ASSET_TYPE_INVALID")
        counts[ASSET_TYPES[kind]] += 1
    return counts


def diagnose_403():
    """Explain only the two failed reads; do not repeat the asset inventory."""
    try:
        access_token = token()
    except Unavailable as exc:
        print("STOP:", str(exc), flush=True)
        print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
        return 2
    for label, service, endpoint in (
        ("NCC", "networkconnectivity.googleapis.com", NCC),
        ("VPC_ACCESS", "vpcaccess.googleapis.com", VPC),
    ):
        try:
            state = read_json(SERVICE_USAGE + service, access_token)
            name = state.get("name")
            if (name != "projects/" + PROJECT_NUMBER + "/services/" + service
                    or state.get("state") not in ("ENABLED", "DISABLED")):
                raise Unavailable("SERVICE_STATE_INVALID")
            print("LAB_" + label + "_SERVICE=" + state["state"], flush=True)
        except Unavailable as exc:
            print("LAB_" + label + "_SERVICE=UNKNOWN_" + str(exc), flush=True)
        try:
            read_json(endpoint + "?pageSize=1", access_token)
            print("LAB_" + label + "_READ=ACCESSIBLE", flush=True)
        except Unavailable as exc:
            print("LAB_" + label + "_READ=UNKNOWN_" + str(exc), flush=True)
    print("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", flush=True)
    print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
    return 0


def quota_fallback():
    """Try the existing Cloud Shell project's quota, reading LAB resources only."""
    try:
        access_token = token()
    except Unavailable as exc:
        print("STOP:", str(exc), flush=True)
        print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
        return 2
    try:
        rows = pages(NCC, "spokes", access_token, quota_project=SHELL_QUOTA_PROJECT)
        print("LAB_GLOBAL_NCC_SPOKES=" + ("PRESENT" if rows else "EMPTY"), flush=True)
    except Unavailable as exc:
        print("LAB_GLOBAL_NCC_SPOKES=UNKNOWN_" + str(exc), flush=True)
    try:
        count = connectors(access_token, quota_project=SHELL_QUOTA_PROJECT)
        print("LAB_ALL_REGIONS_VPC_CONNECTORS=" + ("PRESENT" if count else "EMPTY"), flush=True)
    except Unavailable as exc:
        print("LAB_ALL_REGIONS_VPC_CONNECTORS=UNKNOWN_" + str(exc), flush=True)
    print("LAB_RESOURCE_PROJECT_FIXED=True", flush=True)
    print("QUOTA_PROJECT_IS_EXISTING_CLOUD_SHELL_PROJECT=True", flush=True)
    print("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", flush=True)
    print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
    return 0


def require_no_additional_network_paths(access_token):
    """Require fresh live empty inventories before any isolated-lab restart."""
    if pages(NCC, "spokes", access_token, quota_project=SHELL_QUOTA_PROJECT):
        raise Unavailable("LAB_NCC_SPOKES_PRESENT")
    if connectors(access_token, quota_project=SHELL_QUOTA_PROJECT):
        raise Unavailable("LAB_VPC_CONNECTORS_PRESENT")
    try:
        read_json(APP, access_token)
    except Unavailable as exc:
        if str(exc) != "HTTP_404":
            raise Unavailable("LAB_APP_ENGINE_UNVERIFIED_" + str(exc)) from exc
    else:
        raise Unavailable("LAB_APP_ENGINE_PRESENT")
    return True


def main():
    try:
        access_token = token()
    except Unavailable as exc:
        print("STOP:", str(exc), flush=True)
        print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
        return 2

    try:
        rows = pages(NCC, "spokes", access_token)
        print("LAB_GLOBAL_NCC_SPOKES=" + ("PRESENT" if rows else "EMPTY"), flush=True)
    except Unavailable as exc:
        print("LAB_GLOBAL_NCC_SPOKES=UNKNOWN_" + str(exc), flush=True)

    try:
        count = connectors(access_token)
        print("LAB_ALL_REGIONS_VPC_CONNECTORS=" + ("PRESENT" if count else "EMPTY"), flush=True)
    except Unavailable as exc:
        print("LAB_ALL_REGIONS_VPC_CONNECTORS=UNKNOWN_" + str(exc), flush=True)

    try:
        app = read_json(APP, access_token)
        if app.get("id") != PROJECT and app.get("name") != "apps/" + PROJECT:
            raise Unavailable("IDENTITY_INVALID")
        print("LAB_APP_ENGINE_APPLICATION=PRESENT", flush=True)
    except Unavailable as exc:
        value = "ABSENT_HTTP_404" if str(exc) == "HTTP_404" else "UNKNOWN_" + str(exc)
        print("LAB_APP_ENGINE_APPLICATION=" + value, flush=True)

    try:
        counts = snapshot(access_token)
        print("LAB_ASSET_SNAPSHOT_NCC=" + str(counts["NCC"]), flush=True)
        print("LAB_ASSET_SNAPSHOT_CONNECTORS=" + str(counts["CONNECTORS"]), flush=True)
        print("LAB_ASSET_SNAPSHOT_APP_ENGINE=" + str(counts["APP_ENGINE"]), flush=True)
        print("LAB_ASSET_SNAPSHOT_MAY_BE_DELAYED=True", flush=True)
    except Unavailable as exc:
        print("LAB_ASSET_SNAPSHOT=UNKNOWN_" + str(exc), flush=True)

    print("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", flush=True)
    print("READ_ONLY_NO_CLOUD_MUTATIONS=True", flush=True)
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--explain-403"]:
        sys.exit(diagnose_403())
    if sys.argv[1:] == ["--quota-fallback"]:
        sys.exit(quota_fallback())
    if sys.argv[1:]:
        print("STOP: UNKNOWN_OPTION", flush=True)
        sys.exit(2)
    sys.exit(main())
