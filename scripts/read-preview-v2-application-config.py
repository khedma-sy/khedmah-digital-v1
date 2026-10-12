#!/usr/bin/env python3
"""Read replacement Preview application metadata, never secret payloads or config keys."""

import argparse
import datetime
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
SECRETS = (
    "RESEND_API_KEY", "GOOGLE_MAPS_BROWSER_API_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
)
SERVICES = ("firebase.googleapis.com", "identitytoolkit.googleapis.com",
            "maps-backend.googleapis.com", "apikeys.googleapis.com",
            "secretmanager.googleapis.com")


def stop(code):
    raise SystemExit("STOP: " + code)


def emit(stage, **fields):
    print(json.dumps(dict(stage=stage, **fields), sort_keys=True), flush=True)


def outcome(error):
    if re.search(r"SERVICE_DISABLED|API has not been used|API .*disabled", error, re.I):
        return "API_UNAVAILABLE"
    if re.search(r"PERMISSION_DENIED|Permission .* denied|does not have permission", error, re.I):
        return "PERMISSION_DENIED"
    if re.search(r"NOT_FOUND|not found|does not exist", error, re.I):
        return "NOT_FOUND_REPORTED"
    if re.search(r"UNAUTHENTICATED|invalid authentication credentials|no active account", error, re.I):
        return "AUTHENTICATION_FAILED"
    return "UNCLASSIFIED_READ_FAILURE"


def cloud(*args, fields=None, optional=False):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields is not None:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, timeout=45, env=dict(
                                    os.environ, LC_ALL="C", CLOUDSDK_CORE_LOG_HTTP="false",
                                    CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true",
                                    CLOUDSDK_CORE_DISABLE_PROMPTS="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("LOCAL_READ_FAILED")
    if result.returncode:
        code = outcome(result.stderr)
        if optional:
            return {"outcome": code}, None
        stop("GCLOUD_" + code)
    if fields is None:
        return result.stdout.strip()
    try:
        data = json.loads(result.stdout)
    except ValueError:
        stop("INVALID_METADATA")
    if data is None:
        stop("INVALID_METADATA")
    return {"outcome": "OK"}, data


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def firebase_get(token, suffix="", query=None):
    url = "https://firebase.googleapis.com/v1beta1/projects/" + PROJECT + suffix
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, method="GET", headers={
        "Authorization": "Bearer " + token, "x-goog-user-project": PROJECT})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            data = json.loads(response.read(1024 * 1024))
        if not isinstance(data, dict):
            stop("INVALID_FIREBASE_METADATA")
        return {"outcome": "OK"}, data
    except urllib.error.HTTPError as error:
        return {"outcome": {401: "AUTHENTICATION_FAILED", 403: "PERMISSION_DENIED",
                            404: "NOT_FOUND_REPORTED"}.get(error.code, "HTTP_READ_FAILED"),
                "http_status": error.code}, None
    except (ValueError, OSError):
        stop("FIREBASE_READ_FAILED")


def read_firebase():
    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    result, project = firebase_get(token, query={"fields": "name,projectId,projectNumber,state"})
    if project is None:
        emit("FIREBASE_PROJECT", **result, existence_unconfirmed=True)
        return
    if (project.get("projectId") != PROJECT or str(project.get("projectNumber")) != NUMBER
            or project.get("name") not in ("projects/" + PROJECT, "projects/" + NUMBER)
            or project.get("state") not in ("ACTIVE", "DELETED")):
        stop("FIREBASE_PROJECT_MISMATCH")
    emit("FIREBASE_PROJECT", **result, state=project["state"])
    if project["state"] != "ACTIVE":
        return
    seen_apps, seen_pages, page = set(), set(), ""
    for _ in range(50):
        result, data = firebase_get(token, "/webApps", {
            "pageSize": 100, "pageToken": page,
            "fields": "apps(name,projectId,state),nextPageToken"})
        if data is None:
            emit("FIREBASE_WEB_APPS", **result, inventory_complete=False)
            return
        apps = data.get("apps", [])
        if not isinstance(apps, list):
            stop("INVALID_FIREBASE_APP_METADATA")
        for app in apps:
            if (not isinstance(app, dict) or app.get("projectId") != PROJECT
                    or app.get("state") != "ACTIVE"
                    or not re.fullmatch(r"projects/(?:" + PROJECT + "|" + NUMBER
                                        + r")/webApps/[^/\s]+", app.get("name", ""))
                    or app["name"] in seen_apps):
                stop("INVALID_FIREBASE_APP_METADATA")
            seen_apps.add(app["name"])
        page = data.get("nextPageToken", "")
        if not isinstance(page, str) or page in seen_pages:
            stop("INVALID_FIREBASE_PAGINATION")
        if not page:
            emit("FIREBASE_WEB_APPS", outcome="OK", active_app_count=len(seen_apps),
                 inventory_complete=True, sdk_configuration_read=False)
            return
        seen_pages.add(page)
    stop("FIREBASE_PAGINATION_LIMIT")


def run():
    if os.environ.get("CLOUDSDK_AUTH_ACCESS_TOKEN"):
        stop("AUTH_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key) not in ("", "(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    _, project = cloud("projects", "describe", PROJECT,
                       fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER
            or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": ORGANIZATION}):
        stop("PROJECT_IDENTITY_MISMATCH")
    emit("PREVIEW_APPLICATION_CONFIG_TARGET_VERIFIED", project=PROJECT,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    _, data = cloud("services", "list", "--enabled", fields="config.name")
    if (not isinstance(data, list) or any(not isinstance(item, dict)
            or not isinstance(item.get("config"), dict)
            or not isinstance(item["config"].get("name"), str) for item in data)):
        stop("INVALID_SERVICE_METADATA")
    enabled = {item["config"]["name"] for item in data}
    emit("APPLICATION_APIS", enabled={name: name in enabled for name in SERVICES})
    for secret in SECRETS:
        parents = ["projects/" + value + "/secrets/" + secret for value in (PROJECT, NUMBER)]
        container, data = cloud("secrets", "describe", secret, fields="name", optional=True)
        if data is not None:
            if not isinstance(data, dict) or data.get("name") not in parents:
                stop("SECRET_NAMESPACE_MISMATCH")
            container["exists"] = True
        latest, data = cloud("secrets", "versions", "describe", "latest", "--secret=" + secret,
                             fields="name,state", optional=True)
        if data is not None:
            name = data.get("name", "") if isinstance(data, dict) else ""
            parent, separator, version = name.rpartition("/versions/")
            if (not separator or parent not in parents or not re.fullmatch(r"[1-9][0-9]*", version)
                    or data.get("state") not in ("ENABLED", "DISABLED", "DESTROYED")):
                stop("INVALID_SECRET_VERSION_METADATA")
            latest.update(version=version, state=data["state"])
        emit("APPLICATION_SECRET_METADATA", secret=secret, container=container, latest=latest)
    if "firebase.googleapis.com" in enabled:
        read_firebase()
    else:
        emit("FIREBASE_PROJECT", outcome="NOT_QUERIED_API_NOT_ENABLED", existence_unconfirmed=True)
    emit("PREVIEW_V2_APPLICATION_CONFIG_READ_COMPLETED_NO_MUTATION",
         configuration_values_verified=False, secret_payload_access=False, cloud_mutation=False,
         runtime_access_verified=False, email_delivery_verified=False)


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run()
