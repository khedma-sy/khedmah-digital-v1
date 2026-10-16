#!/usr/bin/env python3
"""Owner-run Firebase project/WebApp registration for the fixed replacement Preview."""

import argparse
import contextlib
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
WEB_NAME = "Khedmah Preview V2 Web"
PARENT = "projects/" + PROJECT
PROJECT_FIELDS = "name,projectId,projectNumber,state"
APP_FIELDS = "name,appId,displayName,projectId,state,apiKeyId"
PERMISSIONS = ("resourcemanager.projects.get", "serviceusage.services.get",
               "serviceusage.services.enable", "firebase.projects.get",
               "firebase.projects.update", "firebase.clients.create",
               "firebase.clients.get", "firebase.clients.list")
SERVICES = {"firebase.googleapis.com", "identitytoolkit.googleapis.com",
            "apikeys.googleapis.com", "maps-backend.googleapis.com"}
STAGES = ("ADD_FIREBASE", "CREATE_WEB_APP")


def stop(code):
    raise SystemExit("STOP: " + code)


def emit(stage, **values):
    print(json.dumps(dict(stage=stage, **values), sort_keys=True), flush=True)


def cloud(*args, fields=None):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields is not None:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                stdin=subprocess.DEVNULL, timeout=60, env=dict(
                                    os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
                                    CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true",
                                    CLOUDSDK_CORE_DISABLE_PROMPTS="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_COMMAND_FAILED")
    if result.returncode:
        stop("GCLOUD_COMMAND_FAILED")
    if fields is None:
        return result.stdout.strip()
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop("INVALID_GCLOUD_METADATA")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def operation_name(value):
    # Firebase documents operations/**, not a single short identifier. Accept
    # nested paths and URI pchar (including base64 padding), but no traversal,
    # percent escapes, query/fragment delimiters, controls or alternate host.
    return (isinstance(value, str) and len(value) <= 4096
            and re.fullmatch(r"operations/[A-Za-z0-9._~!$&'()*+,;=:@/-]+", value) is not None
            and all(part not in ("", ".", "..") for part in value.split("/")))


class Client:
    def __init__(self, token, apply):
        self.token, self.apply = token, apply
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, path, *, body=None, query=None, missing=False, iam=False):
        if iam:
            if path != PARENT + ":testIamPermissions" or body != {"permissions": list(PERMISSIONS)}:
                stop("IAM_REQUEST_SCOPE_REJECTED")
            base = "https://cloudresourcemanager.googleapis.com/v3/"
        else:
            base = "https://firebase.googleapis.com/v1beta1/"
            if body is None:
                if path not in (PARENT, PARENT + "/webApps", "availableProjects") and not operation_name(path):
                    stop("READ_SCOPE_REJECTED")
            elif not self.apply or (path, body) not in (
                    (PARENT + ":addFirebase", {}),
                    (PARENT + "/webApps", {"displayName": WEB_NAME})):
                stop("WRITE_SCOPE_REJECTED")
        # Preserve opaque operation names in the journal; encode path characters
        # only for transport, keeping their documented slash separators.
        url = base + (urllib.parse.quote(path, safe="/") if operation_name(path) else path)
        if query:
            url += "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(
            url, method="GET" if body is None else "POST",
            data=None if body is None else json.dumps(body).encode(),
            headers={"Authorization": "Bearer " + self.token,
                     "Content-Type": "application/json", "x-goog-user-project": PROJECT})
        try:
            with self.opener.open(request, timeout=45) as response:
                data = json.loads(response.read(1024 * 1024))
            if not isinstance(data, dict):
                stop("INVALID_API_METADATA")
            return data
        except urllib.error.HTTPError as error:
            if error.code == 404 and missing and body is None and path == PARENT:
                return None
            # Error messages/bodies can contain caller-specific details. Never echo them.
            stop("HTTP_" + str(error.code) + "_RECONCILE")
        except (ValueError, OSError):
            stop("API_REQUEST_UNCONFIRMED_RECONCILE")

    def pages(self, path, key, fields, **query):
        seen, page = set(), ""
        for _ in range(50):
            data = self.request(path, query=dict(query, pageSize=100, pageToken=page, fields=fields))
            items = data.get(key, [])
            if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
                stop("INVALID_LIST_METADATA")
            yield from items
            page = data.get("nextPageToken", "")
            if not isinstance(page, str) or page in seen:
                stop("INVALID_PAGINATION")
            if not page:
                return
            seen.add(page)
        stop("PAGINATION_LIMIT")


def validate_project(data):
    if (not isinstance(data, dict) or data.get("projectId") != PROJECT
            or str(data.get("projectNumber")) != NUMBER
            or data.get("name") not in (PARENT, "projects/" + NUMBER)
            or data.get("state") != "ACTIVE"):
        stop("FIREBASE_PROJECT_MISMATCH")
    return dict(name=PARENT, projectId=PROJECT, projectNumber=NUMBER, state="ACTIVE")


def get_project(client):
    data = client.request(PARENT, query={"fields": PROJECT_FIELDS}, missing=True)
    return None if data is None else validate_project(data)


def validate_app(data):
    app_id = data.get("appId") if isinstance(data, dict) else None
    if (not isinstance(app_id, str) or not app_id or len(app_id) > 200
            or re.search(r"[/\s?#]", app_id) or data.get("projectId") != PROJECT
            or data.get("name") not in (PARENT + "/webApps/" + app_id,
                                        "projects/" + NUMBER + "/webApps/" + app_id)
            or data.get("displayName") != WEB_NAME or data.get("state") != "ACTIVE"
            or not isinstance(data.get("apiKeyId"), str) or not data["apiKeyId"]):
        stop("WEB_APP_CONFLICT_OR_NOT_READY")
    return dict({key: data[key] for key in APP_FIELDS.split(",")}, name=PARENT + "/webApps/" + app_id)


def get_app(client):
    apps = list(client.pages(PARENT + "/webApps", "apps",
                            "apps(" + APP_FIELDS + "),nextPageToken", showDeleted="true"))
    if len(apps) > 1:
        stop("WEB_APP_INVENTORY_CONFLICT")
    return validate_app(apps[0]) if apps else None


def preflight(apply):
    if os.environ.get("CLOUDSDK_AUTH_ACCESS_TOKEN"):
        stop("AUTH_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key) not in ("", "(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    data = cloud("projects", "describe", PROJECT, fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(data, dict) or data.get("projectId") != PROJECT
            or str(data.get("projectNumber")) != NUMBER or data.get("lifecycleState") != "ACTIVE"
            or data.get("parent") != {"type": "organization", "id": ORGANIZATION}):
        stop("PROJECT_IDENTITY_MISMATCH")
    data = cloud("services", "list", "--enabled", fields="config.name")
    if (not isinstance(data, list) or any(not isinstance(item, dict)
            or not isinstance(item.get("config"), dict) for item in data)):
        stop("INVALID_SERVICE_METADATA")
    if not SERVICES.issubset({item["config"].get("name") for item in data}):
        stop("APPLICATION_APIS_NOT_READY")
    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    client = Client(token, apply)
    response = client.request(PARENT + ":testIamPermissions", iam=True,
                              body={"permissions": list(PERMISSIONS)})
    granted = response.get("permissions", [])
    if not isinstance(granted, list) or set(granted) != set(PERMISSIONS):
        stop("FIREBASE_PERMISSIONS_INCOMPLETE")
    emit("PREVIEW_FIREBASE_IDENTITY_AND_PERMISSIONS_VERIFIED", project=PROJECT)
    return client


class Journal:
    """Durable metadata intent before each POST; no token, SDK config or key string."""
    def __init__(self, directory):
        self.directory = directory
        self.path = directory / "state.json"
        self.data = dict(project=PROJECT, number=NUMBER, stages={})

    def __enter__(self):
        if self.directory.is_symlink():
            stop("JOURNAL_PATH_REJECTED")
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        lock = self.directory / "lock"
        if lock.is_symlink() or self.path.is_symlink():
            stop("JOURNAL_PATH_REJECTED")
        self.lock = lock.open("a")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            stop("FIREBASE_BOOTSTRAP_ALREADY_RUNNING")
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text())
                if (data.get("project") != PROJECT or data.get("number") != NUMBER
                        or not isinstance(data.get("stages"), dict)
                        or set(data["stages"]) - set(STAGES)):
                    raise ValueError()
                for value in data["stages"].values():
                    if not isinstance(value, dict) or value.get("attempted") is not True:
                        raise ValueError()
                    if "operation" in value and not operation_name(value["operation"]):
                        raise ValueError()
                self.data = data
            except (ValueError, AttributeError):
                self.lock.close()
                stop("JOURNAL_RECONCILE_REQUIRED")
        return self

    def __exit__(self, *args):
        self.lock.close()

    def save(self):
        temporary = self.directory / "state.tmp"
        if temporary.is_symlink():
            stop("JOURNAL_PATH_REJECTED")
        with temporary.open("w") as stream:
            os.chmod(temporary, 0o600)
            json.dump(self.data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, self.path)

    def observe(self, stage, resource):
        record = self.data["stages"].get(stage)
        if record:
            if record.get("resource") and record["resource"] != resource:
                stop("JOURNAL_RESOURCE_MISMATCH")
            record.update(verified=True, resource=resource)
            self.save()

    def perform(self, client, stage, path, body, validate):
        record = self.data["stages"].get(stage)
        if record:
            if record.get("verified"):
                stop("VERIFIED_RESOURCE_NOW_MISSING_RECONCILE")
            if "operation" not in record:
                stop("UNCONFIRMED_" + stage + "_RECONCILE")
            operation = client.request(record["operation"])
            emit("FIREBASE_OPERATION_RESUMED", action=stage, operation=record["operation"])
        else:
            record = dict(attempted=True)
            self.data["stages"][stage] = record
            self.save()
            emit("STAGE_ATTEMPT", action=stage)
            operation = client.request(path, body=body)
            # Keep bounded name-only evidence even if a future receipt format is
            # unsupported. Never save the whole response, metadata or error body.
            receipt_name = operation.get("name")
            record["receipt_name"] = (receipt_name if isinstance(receipt_name, str)
                                      and len(receipt_name) <= 4096 else None)
            accepted = operation_name(receipt_name)
            if accepted:
                record["operation"] = receipt_name
            self.save()
            if not accepted:
                stop("INVALID_OPERATION_RECEIPT_RECONCILE")
            emit("FIREBASE_OPERATION", action=stage, operation=record["operation"])
        for _ in range(60):
            if operation.get("name") != record["operation"]:
                stop("OPERATION_IDENTITY_MISMATCH")
            if "error" in operation:
                code = operation["error"].get("code") if isinstance(operation["error"], dict) else None
                stop("OPERATION_FAILED_" + (str(code) if type(code) is int else "UNKNOWN") + "_RECONCILE")
            if operation.get("done") is True:
                resource = validate(operation.get("response"))
                record["resource"] = resource["name"]
                self.save()
                return resource
            if operation.get("done", False) is not False:
                stop("INVALID_OPERATION_STATE")
            time.sleep(4)
            operation = client.request(record["operation"])
        stop("OPERATION_PENDING_RERUN_SAME_COMMAND")


def run(apply=False, directory=None, require_existing_project=False):
    os.umask(0o077)
    context = Journal(directory or Path.home() / "khedmah-preview-v2-firebase-bootstrap") if apply else contextlib.nullcontext()
    with context as journal:
        client = preflight(apply)
        project = get_project(client)
        if project is None and require_existing_project:
            stop("EXISTING_FIREBASE_PROJECT_REQUIRED_RECONCILE")
        if project is None:
            candidates = list(client.pages("availableProjects", "projectInfo", "projectInfo(project),nextPageToken"))
            matches = [item for item in candidates if item.get("project") in (PARENT, "projects/" + NUMBER)]
            # Resume an already acknowledged operation even if provisioning removes the
            # project from availableProjects. A fresh POST always requires eligibility.
            pending = journal and journal.data["stages"].get("ADD_FIREBASE", {}).get("operation")
            if len(matches) != 1 and not pending:
                stop("FIREBASE_ADD_ELIGIBILITY_UNCONFIRMED")
        app = get_app(client) if project else None
        emit("PREVIEW_FIREBASE_REGISTRATION_PLAN", project=PROJECT, add_firebase=project is None,
             create_web_app=app is None, web_app_display_name=WEB_NAME, apply=apply,
             require_existing_project=require_existing_project)
        if not apply:
            emit("PREVIEW_FIREBASE_PLAN_COMPLETE_NO_MUTATION")
            return
        if project is None:
            journal.perform(client, "ADD_FIREBASE", PARENT + ":addFirebase", {}, validate_project)
            project = get_project(client)
            if project is None:
                stop("FIREBASE_PROJECT_READBACK_PENDING")
        journal.observe("ADD_FIREBASE", project["name"])
        emit("PREVIEW_FIREBASE_PROJECT_VERIFIED", project=PROJECT, state=project["state"])
        # Fresh complete inventory before creation, including deleted apps. Never pick
        # another app by list order or silently register alongside unexpected apps.
        app = get_app(client)
        if app is None:
            created = journal.perform(client, "CREATE_WEB_APP", PARENT + "/webApps",
                                      {"displayName": WEB_NAME}, validate_app)
            app = get_app(client)
            if app is None or app["appId"] != created["appId"]:
                stop("WEB_APP_READBACK_PENDING_OR_MISMATCH")
        journal.observe("CREATE_WEB_APP", app["name"])
        emit("PREVIEW_V2_FIREBASE_PROJECT_AND_WEB_APP_VERIFIED", project=PROJECT,
             evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
             app_id=app["appId"], api_key_association_present=True,
             browser_configuration_ready=False, auth_providers_configured=False,
             secret_versions_created=False, sdk_configuration_read=False,
             api_key_restrictions_verified=False, application_deployed=False, floot_connected=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--require-existing-project", action="store_true",
                        help="Stop unless Firebase is already ACTIVE; never submit addFirebase.")
    options = parser.parse_args()
    try:
        run(options.apply, require_existing_project=options.require_existing_project)
    except OSError:
        stop("LOCAL_STATE_FAILURE_RECONCILE")
