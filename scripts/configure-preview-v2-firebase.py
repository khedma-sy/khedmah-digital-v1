#!/usr/bin/env python3
"""Stage five verified Firebase SDK values in the replacement Preview only.

No Firebase resource creation, key restriction change, Auth setup or deployment.
Storage and Analytics require separate reconciliation; no placeholders are used.
"""
import argparse
import base64
import contextlib
import datetime
import fcntl
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
APP_ID = "1:1044962071847:web:919c294e1cd5ed37374502"
WEB_NAME = "Khedmah Preview V2 Web"
PARENT = "projects/" + PROJECT
APP = PARENT + "/webApps/" + APP_ID
KEY_PARENT = "projects/" + NUMBER + "/locations/global/keys"
SM_PARENT = "projects/" + NUMBER + "/secrets/"
FIELDS = {
    "NEXT_PUBLIC_FIREBASE_API_KEY": "apiKey",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "authDomain",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "projectId",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": "messagingSenderId",
    "NEXT_PUBLIC_FIREBASE_APP_ID": "appId",
}
PERMISSIONS = ["secretmanager.secrets.get", "secretmanager.versions.list",
               "secretmanager.versions.get", "secretmanager.versions.access",
               "secretmanager.versions.add"]
BASES = {"firebase": "https://firebase.googleapis.com/v1beta1/",
         "keys": "https://apikeys.googleapis.com/v2/",
         "secrets": "https://secretmanager.googleapis.com/v1/"}


def stop(code):
    raise SystemExit("STOP: " + code)


def emit(stage, **values):
    print(json.dumps(dict(stage=stage, **values), sort_keys=True), flush=True)


def cloud(*args, fields=None):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60,
                                stdin=subprocess.DEVNULL, env=dict(os.environ,
                                    CLOUDSDK_CORE_LOG_HTTP="false",
                                    CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true",
                                    CLOUDSDK_CORE_DISABLE_PROMPTS="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_READ_FAILED")
    if result.returncode:
        stop("GCLOUD_READ_FAILED")
    if not fields:
        return result.stdout.strip()
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop("INVALID_GCLOUD_METADATA")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def payload(value):
    return {"payload": {"data": base64.b64encode(value.encode()).decode()}}


class Client:
    def __init__(self, token, apply):
        self.token, self.apply = token, apply
        self.key_name = None
        self.desired = {}
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, service, path, *, body=None, query=None):
        allowed = False
        if service == "firebase" and body is None:
            allowed = path in (PARENT, PARENT + "/webApps", APP + "/config")
        elif service == "keys" and body is None:
            allowed = path == KEY_PARENT or (self.key_name is not None
                                             and path == self.key_name + "/keyString")
        elif service == "secrets":
            for name in FIELDS:
                parent = SM_PARENT + name
                if body is None:
                    allowed |= path in (parent, parent + "/versions", parent + "/versions/1",
                                        parent + "/versions/1:access")
                else:
                    allowed |= (path == parent + ":testIamPermissions"
                                and body == {"permissions": PERMISSIONS})
                    allowed |= (self.apply and name in self.desired and path == parent + ":addVersion"
                                and body == payload(self.desired[name]))
        if not allowed:
            stop("REQUEST_SCOPE_REJECTED")
        url = BASES[service] + urllib.parse.quote(path, safe="/:")
        if query:
            url += "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, method="GET" if body is None else "POST",
            data=None if body is None else json.dumps(body).encode(), headers={
                "Authorization": "Bearer " + self.token, "x-goog-user-project": PROJECT,
                "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=45) as response:
                raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                stop("RESPONSE_TOO_LARGE")
            data = json.loads(raw)
            if not isinstance(data, dict):
                stop("INVALID_API_RESPONSE")
            return data
        except urllib.error.HTTPError as error:
            stop(service.upper() + "_HTTP_" + str(error.code) + "_RECONCILE")
        except (ValueError, OSError):
            stop(service.upper() + "_REQUEST_UNCONFIRMED_RECONCILE")

    def pages(self, service, path, key, fields, **query):
        seen, page = set(), ""
        for _ in range(50):
            data = self.request(service, path, query=dict(query, pageSize=100, pageToken=page, fields=fields))
            items = data.get(key, [])
            if not isinstance(items, list) or any(not isinstance(v, dict) for v in items):
                stop("INVALID_LIST_METADATA")
            yield from items
            page = data.get("nextPageToken", "")
            if not isinstance(page, str) or page in seen:
                stop("INVALID_PAGINATION")
            if not page:
                return
            seen.add(page)
        stop("PAGINATION_LIMIT")


def preflight(apply):
    if os.environ.get("CLOUDSDK_AUTH_ACCESS_TOKEN"):
        stop("AUTH_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key) not in ("", "(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    project = cloud("projects", "describe", PROJECT, fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"id": ORGANIZATION, "type": "organization"}):
        stop("PROJECT_IDENTITY_MISMATCH")
    services = cloud("services", "list", "--enabled", fields="config.name")
    if (not isinstance(services, list) or any(not isinstance(v, dict)
            or not isinstance(v.get("config"), dict) for v in services)):
        stop("INVALID_SERVICE_METADATA")
    if not {"firebase.googleapis.com", "apikeys.googleapis.com", "secretmanager.googleapis.com"}.issubset(
            {v["config"].get("name") for v in services}):
        stop("REQUIRED_API_NOT_ENABLED")
    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    return Client(token, apply)


def verified_config(client):
    project = client.request("firebase", PARENT, query={"fields": "name,projectId,projectNumber,state"})
    if (project.get("name") not in (PARENT, "projects/" + NUMBER) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER or project.get("state") != "ACTIVE"):
        stop("FIREBASE_PROJECT_MISMATCH")
    apps = list(client.pages("firebase", PARENT + "/webApps", "apps",
        "apps(name,projectId,appId,displayName,state,apiKeyId),nextPageToken", showDeleted="true"))
    if len(apps) != 1:
        stop("WEB_APP_INVENTORY_CONFLICT")
    app = apps[0]
    uid = app.get("apiKeyId")
    if (app.get("name") not in (APP, "projects/" + NUMBER + "/webApps/" + APP_ID)
            or app.get("projectId") != PROJECT or app.get("appId") != APP_ID
            or app.get("displayName") != WEB_NAME or app.get("state") != "ACTIVE"
            or not isinstance(uid, str) or not uid):
        stop("WEB_APP_IDENTITY_MISMATCH")
    config = client.request("firebase", APP + "/config", query={"fields":
        "projectId,projectNumber,appId,apiKey,authDomain,messagingSenderId,storageBucket,measurementId"})
    exact = dict(projectId=PROJECT, appId=APP_ID, authDomain=PROJECT + ".firebaseapp.com", messagingSenderId=NUMBER)
    if (any(config.get(k) != v for k, v in exact.items())
            or ("projectNumber" in config and str(config["projectNumber"]) != NUMBER)):
        stop("SDK_CONFIG_IDENTITY_MISMATCH")
    key = config.get("apiKey")
    if not isinstance(key, str) or not 1 <= len(key) <= 512 or any(c.isspace() for c in key):
        stop("SDK_KEY_MISSING_OR_INVALID")
    keys = list(client.pages("keys", KEY_PARENT, "keys", "keys(name,uid,restrictions,deleteTime),nextPageToken"))
    if any(not re.fullmatch(re.escape(KEY_PARENT) + r"/[A-Za-z0-9_-]+", k.get("name", "")) for k in keys):
        stop("API_KEY_NAMESPACE_MISMATCH")
    matches = [k for k in keys if k.get("uid") == uid]
    if len(matches) != 1 or matches[0].get("deleteTime"):
        stop("API_KEY_ASSOCIATION_UNCONFIRMED")
    metadata = matches[0]
    client.key_name = metadata["name"]
    actual = client.request("keys", client.key_name + "/keyString", query={"fields": "keyString"}).get("keyString")
    if not isinstance(actual, str) or not hmac.compare_digest(actual.encode(), key.encode()):
        stop("SDK_API_KEY_MISMATCH")
    restrictions = metadata.get("restrictions", {})
    if not isinstance(restrictions, dict):
        stop("INVALID_KEY_RESTRICTIONS_METADATA")
    targets = restrictions.get("apiTargets", [])
    if not isinstance(targets, list) or any(not isinstance(t, dict)
            or not isinstance(t.get("service"), str)
            or not re.fullmatch(r"[a-z0-9.-]+\.googleapis\.com", t["service"]) for t in targets):
        stop("INVALID_KEY_RESTRICTIONS_METADATA")
    emit("PREVIEW_FIREBASE_SDK_IDENTITY_VERIFIED", project=PROJECT, app_id=APP_ID,
         api_key_association_verified=True, sdk_configuration_read=True,
         sdk_storage_bucket_present=bool(config.get("storageBucket")),
         sdk_measurement_id_present=bool(config.get("measurementId")))
    emit("FIREBASE_API_KEY_RESTRICTIONS_OBSERVED", api_services=sorted({t["service"] for t in targets}),
         application_restriction_types=sorted(k for k in restrictions if k.endswith("KeyRestrictions")),
         api_key_restrictions_verified=False)
    return {secret: config[field] for secret, field in FIELDS.items()}


def version_one(data, name):
    if not isinstance(data, dict) or data.get("name") != SM_PARENT + name + "/versions/1" or data.get("state") != "ENABLED":
        stop("SECRET_VERSION_CONFLICT_RECONCILE")


def observe_secret(client, name, value):
    versions = list(client.pages("secrets", SM_PARENT + name + "/versions", "versions",
                                "versions(name,state),nextPageToken"))
    if not versions:
        return False
    if len(versions) != 1:
        stop("SECRET_VERSION_INVENTORY_CONFLICT_RECONCILE")
    version_one(versions[0], name)
    version_one(client.request("secrets", SM_PARENT + name + "/versions/1", query={"fields": "name,state"}), name)
    response = client.request("secrets", SM_PARENT + name + "/versions/1:access", query={"fields": "name,payload(data)"})
    if response.get("name") != SM_PARENT + name + "/versions/1":
        stop("SECRET_PAYLOAD_NAMESPACE_MISMATCH")
    try:
        data = base64.b64decode(response["payload"]["data"], validate=True)
    except (KeyError, TypeError, ValueError):
        stop("INVALID_SECRET_PAYLOAD")
    if not hmac.compare_digest(data, value.encode()):
        stop("EXISTING_SECRET_VALUE_MISMATCH_RECONCILE")
    return True


class Journal:
    def __init__(self, directory):
        self.directory, self.path = directory, directory / "state.json"
        self.data = dict(project=PROJECT, number=NUMBER, app_id=APP_ID, secrets={})

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
            stop("CONFIGURATION_ALREADY_RUNNING")
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text())
                if (not isinstance(data, dict) or data.get("project") != PROJECT or data.get("number") != NUMBER
                        or data.get("app_id") != APP_ID or not isinstance(data.get("secrets"), dict)
                        or set(data["secrets"]) - set(FIELDS)):
                    raise ValueError()
                for record in data["secrets"].values():
                    if (not isinstance(record, dict) or set(record) - {"attempted", "verified"}
                            or not record or any(v is not True for v in record.values())):
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


def run(apply=False, directory=None):
    os.umask(0o077)
    context = Journal(directory or Path.home() / "khedmah-preview-v2-firebase-config") if apply else contextlib.nullcontext()
    with context as journal:
        client = preflight(apply)
        values = verified_config(client)
        client.desired = values
        ready = {}
        for name, value in values.items():
            parent = SM_PARENT + name
            container = client.request("secrets", parent, query={"fields": "name"})
            if container.get("name") != parent:
                stop("SECRET_CONTAINER_NAMESPACE_MISMATCH")
            permissions = client.request("secrets", parent + ":testIamPermissions", body={"permissions": PERMISSIONS})
            granted = permissions.get("permissions", [])
            if not isinstance(granted, list) or any(not isinstance(p, str) for p in granted) or set(granted) != set(PERMISSIONS):
                stop("SECRET_PERMISSIONS_INCOMPLETE")
            ready[name] = observe_secret(client, name, value)
            if journal and name in journal.data["secrets"] and not ready[name]:
                stop("UNCONFIRMED_OR_MISSING_SECRET_RECONCILE")
        emit("PREVIEW_FIREBASE_CONFIG_PLAN", apply=apply, create_versions=[k for k in values if not ready[k]],
             already_matching=[k for k in values if ready[k]],
             excluded=["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"])
        if not apply:
            emit("PREVIEW_FIREBASE_CONFIG_PLAN_COMPLETE_NO_MUTATION")
            return
        for name, value in values.items():
            # Recheck immediately before a write; no overwrite or automatic rotation.
            exists = observe_secret(client, name, value)
            if not exists:
                if ready[name] or name in journal.data["secrets"]:
                    stop("UNCONFIRMED_OR_MISSING_SECRET_RECONCILE")
                journal.data["secrets"][name] = dict(attempted=True)
                journal.save()
                emit("FIREBASE_CONFIG_SECRET_VERSION_ATTEMPT", secret=name)
                receipt = client.request("secrets", SM_PARENT + name + ":addVersion", body=payload(value))
                version_one(receipt, name)
                if not observe_secret(client, name, value):
                    stop("SECRET_VERSION_READBACK_PENDING_RECONCILE")
            journal.data["secrets"].setdefault(name, {}).update(verified=True)
            journal.save()
            emit("FIREBASE_CONFIG_SECRET_VERIFIED", secret=name, version="1")
        for name, value in values.items():
            if not observe_secret(client, name, value):
                stop("FINAL_SECRET_READBACK_FAILED")
        emit("PREVIEW_V2_FIREBASE_CORE_CONFIG_STAGED", project=PROJECT, app_id=APP_ID,
             evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(), verified_secret_count=len(values),
             sdk_configuration_read=True, secret_payload_access=True, configuration_values_printed=False,
             browser_configuration_ready=False, storage_configuration_verified=False,
             analytics_configuration_verified=False, api_key_restrictions_verified=False,
             auth_providers_configured=False, runtime_access_verified=False,
             application_deployed=False, floot_connected=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        run(args.apply)
    except (OSError, ValueError, TypeError, KeyError):
        stop("LOCAL_OR_METADATA_FAILURE_RECONCILE")
