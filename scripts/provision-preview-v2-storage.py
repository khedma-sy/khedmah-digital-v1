#!/usr/bin/env python3
"""Owner-run default Storage creation; exact replacement Preview only.

Installs deny-all rules before creating the bucket. Never overwrites an existing
release/bucket, changes IAM/billing, reads secrets, or declares app readiness.
On any failure, return the output for reconciliation instead of blindly retrying.
"""
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
REGION = "europe-west1"
APP_ID = "1:1044962071847:web:919c294e1cd5ed37374502"
PARENT = "projects/" + PROJECT
BUCKET = PROJECT + ".firebasestorage.app"
DEFAULT = "projects/" + NUMBER + "/defaultBucket"
RELEASE = PARENT + "/releases/firebase.storage/" + BUCKET
RULES = "rules_version = '2';\nservice firebase.storage { match /b/{bucket}/o { match /{allPaths=**} { allow read, write: if false; } } }\n"
SOURCE = {"files": [{"name": "storage.rules", "content": RULES}]}
BASES = {"firebase": "https://firebase.googleapis.com/v1beta1/",
         "storage": "https://storage.googleapis.com/storage/v1/",
         "default": "https://firebasestorage.googleapis.com/v1alpha/",
         "rules": "https://firebaserules.googleapis.com/v1/"}


def stop(code):
    raise SystemExit("STOP: " + code)


def emit(stage, **data):
    print(json.dumps(dict(stage=stage, **data), sort_keys=True), flush=True)


def cloud(*args, fields=None):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=180,
            stdin=subprocess.DEVNULL, env=dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
                CLOUDSDK_CORE_DISABLE_PROMPTS="true", CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_OPERATION_UNCONFIRMED_RETURN_OUTPUT")
    if result.returncode:
        stop("GCLOUD_" + "_".join(args[:2]).upper().replace("-", "_") + "_FAILED_RETURN_OUTPUT")
    if not fields:
        return result.stdout.strip()
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop("INVALID_GCLOUD_METADATA")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        self.token = token
        self.ruleset = None
        self.allow_create = False
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, service, path, *, body=None, query=None, missing=False):
        allowed = False
        if body is None:
            allowed = (service == "firebase" and path in (
                PARENT, PARENT + "/webApps/" + APP_ID + "/config"))
            allowed |= service == "default" and path == DEFAULT
            allowed |= service == "storage" and path in ("b", "b/" + BUCKET, "b/" + BUCKET + "/iam")
            allowed |= service == "rules" and (path == RELEASE or bool(re.fullmatch(
                re.escape(PARENT) + r"/rulesets/[A-Za-z0-9_-]+", path)))
        else:
            allowed = service == "rules" and path == PARENT + "/rulesets" and body == {"source": SOURCE}
            allowed |= (service == "rules" and path == PARENT + "/releases" and self.ruleset is not None
                        and body == {"name": RELEASE, "rulesetName": self.ruleset})
            allowed |= service == "default" and path == DEFAULT and self.allow_create and body == {"location": REGION}
        if not allowed:
            stop("REQUEST_SCOPE_REJECTED")
        url = BASES[service] + urllib.parse.quote(path, safe="/:")
        if query:
            url += "?" + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, method="GET" if body is None else "POST",
            data=None if body is None else json.dumps(body).encode(), headers={
                "Authorization": "Bearer " + self.token, "x-goog-user-project": PROJECT,
                "Content-Type": "application/json"})
        try:
            with self.opener.open(req, timeout=60) as response:
                raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                stop("RESPONSE_TOO_LARGE")
            data = json.loads(raw)
            if not isinstance(data, dict):
                stop("INVALID_API_RESPONSE")
            return data
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read(65536)).get("error", {})
                status = detail.get("status", "")
                reasons = [d["reason"] for d in detail.get("details", [])
                           if isinstance(d, dict) and d.get("reason")]
            except (ValueError, AttributeError, TypeError):
                status, reasons = "", []
            # A denial/disabled API or malformed 404 never proves absence.
            if missing and body is None and error.code == 404 and status == "NOT_FOUND" and not reasons:
                return None
            safe_status = status if isinstance(status, str) and re.fullmatch(r"[A-Z_]{1,64}", status) else "UNKNOWN"
            emit("STORAGE_API_ERROR", service=service, http_status=error.code, status=safe_status)
            stop("API_OPERATION_UNCONFIRMED_RETURN_OUTPUT")
        except (ValueError, OSError):
            stop("API_OPERATION_UNCONFIRMED_RETURN_OUTPUT")


def preflight():
    if os.environ.get("CLOUDSDK_AUTH_ACCESS_TOKEN"):
        stop("AUTH_OVERRIDE_PRESENT")
    for name in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + name) not in ("", "(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    p = cloud("projects", "describe", PROJECT, fields="projectId,projectNumber,lifecycleState,parent")
    if not isinstance(p, dict) or (p.get("projectId"), str(p.get("projectNumber")), p.get("lifecycleState"), p.get("parent")) != (
            PROJECT, NUMBER, "ACTIVE", {"id": ORGANIZATION, "type": "organization"}):
        stop("PROJECT_IDENTITY_MISMATCH")
    billing = cloud("billing", "projects", "describe", PROJECT, fields="projectId,billingEnabled")
    if billing != {"projectId": PROJECT, "billingEnabled": True}:
        stop("EXISTING_BILLING_NOT_VERIFIED")
    services = cloud("services", "list", "--enabled", fields="config.name")
    if not isinstance(services, list) or any(not isinstance(x, dict) or not isinstance(x.get("config"), dict) for x in services):
        stop("INVALID_SERVICE_INVENTORY")
    names = {x["config"].get("name") for x in services}
    if not {"firebase.googleapis.com", "storage.googleapis.com", "firebaserules.googleapis.com"} <= names:
        stop("REQUIRED_EXISTING_API_MISSING")
    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    return Client(token), names


def buckets(client):
    result, seen_tokens, seen_names, page = [], set(), set(), ""
    for _ in range(50):
        data = client.request("storage", "b", query={"project": PROJECT, "projection": "noAcl",
            "returnPartialSuccess": "false", "maxResults": 100, "pageToken": page,
            "fields": "items(name,projectNumber,location),nextPageToken,unreachable"})
        items = data.get("items", [])
        if data.get("unreachable") or not isinstance(items, list):
            stop("INCOMPLETE_BUCKET_INVENTORY")
        for item in items:
            if (not isinstance(item, dict) or str(item.get("projectNumber")) != NUMBER
                    or not isinstance(item.get("name"), str) or item["name"] in seen_names):
                stop("BUCKET_INVENTORY_MISMATCH")
            seen_names.add(item["name"])
            result.append(item)
        page = data.get("nextPageToken", "")
        if not isinstance(page, str) or page in seen_tokens:
            stop("INVALID_BUCKET_PAGINATION")
        if not page:
            return result
        seen_tokens.add(page)
    stop("BUCKET_PAGINATION_LIMIT")


def check_rules(client, release):
    if not isinstance(release, dict) or release.get("name") != RELEASE:
        stop("RULE_RELEASE_IDENTITY_MISMATCH")
    name = release.get("rulesetName", "")
    if not isinstance(name, str) or not re.fullmatch(re.escape(PARENT) + r"/rulesets/[A-Za-z0-9_-]+", name):
        stop("RULESET_IDENTITY_MISMATCH")
    ruleset = client.request("rules", name)
    files = ruleset.get("source", {}).get("files", [])
    if (ruleset.get("name") != name or not isinstance(files, list) or len(files) != 1
            or files[0].get("name") != "storage.rules"
            or not isinstance(files[0].get("content"), str)
            or "".join(files[0]["content"].split()) != "".join(RULES.split())):
        stop("EXISTING_RULES_DIFFER_RETURN_OUTPUT_NO_OVERWRITE")
    return name


def verify(client):
    default = client.request("default", DEFAULT)
    valid_names = {DEFAULT, PARENT + "/defaultBucket"}
    valid_links = {"projects/" + p + "/buckets/" + BUCKET for p in (PROJECT, NUMBER)}
    if (default.get("name") not in valid_names or str(default.get("location", "")).lower() != REGION
            or default.get("bucket", {}).get("name") not in valid_links):
        stop("DEFAULT_BUCKET_IDENTITY_MISMATCH")
    bucket = client.request("storage", "b/" + BUCKET, query={"projection": "full"})
    if (bucket.get("name") != BUCKET or str(bucket.get("projectNumber")) != NUMBER
            or str(bucket.get("location", "")).lower() != REGION):
        stop("BUCKET_IDENTITY_OR_REGION_MISMATCH")
    ruleset = check_rules(client, client.request("rules", RELEASE))
    policy = client.request("storage", "b/" + BUCKET + "/iam", query={"optionsRequestedPolicyVersion": 3})
    if policy.get("resourceId") != "projects/_/buckets/" + BUCKET:
        stop("IAM_RESOURCE_MISMATCH")
    bindings = policy.get("bindings", [])
    if not isinstance(bindings, list):
        stop("INVALID_IAM_METADATA")
    for binding in bindings:
        if not isinstance(binding, dict) or not isinstance(binding.get("members"), list):
            stop("INVALID_IAM_METADATA")
        if any(not isinstance(m, str) for m in binding["members"]):
            stop("INVALID_IAM_METADATA")
        if {"allUsers", "allAuthenticatedUsers"} & set(binding["members"]):
            stop("PUBLIC_BUCKET_IAM_RETURN_OUTPUT_NO_CHANGE")
    for field in ("acl", "defaultObjectAcl"):
        acl = bucket.get(field, [])
        if not isinstance(acl, list) or any(not isinstance(a, dict) for a in acl):
            stop("INVALID_ACL_METADATA")
        if any(a.get("entity") in ("allUsers", "allAuthenticatedUsers") for a in acl):
            stop("PUBLIC_BUCKET_ACL_RETURN_OUTPUT_NO_CHANGE")
    emit("PREVIEW_V2_STORAGE_CONTROL_PLANE_VERIFIED", project=PROJECT, bucket=BUCKET,
         location=bucket["location"], ruleset=ruleset, firebase_linkage_verified=True,
         deny_all_rules_source_verified=True, public_bucket_bindings_found=False,
         iam_configuration=bucket.get("iamConfiguration", {}), effective_iam_verified=False,
         rules_propagation_and_data_plane_verified=False, secret_value_staged=False,
         application_deployed=False, floot_connection_tested=False,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


def run(client, services):
    firebase = client.request("firebase", PARENT, query={"fields": "projectId,projectNumber,state"})
    if (firebase.get("projectId") != PROJECT or str(firebase.get("projectNumber")) != NUMBER
            or firebase.get("state") != "ACTIVE"):
        stop("FIREBASE_PROJECT_MISMATCH")
    config = client.request("firebase", PARENT + "/webApps/" + APP_ID + "/config",
                            query={"fields": "projectId,appId,storageBucket"})
    if config != {"projectId": PROJECT, "appId": APP_ID, "storageBucket": BUCKET}:
        stop("SDK_BUCKET_IDENTITY_MISMATCH")
    inventory = buckets(client)
    existing = next((b for b in inventory if b["name"] == BUCKET), None)
    if existing is not None:
        if "firebasestorage.googleapis.com" not in services:
            stop("EXISTING_UNLINKED_BUCKET_RETURN_OUTPUT_NO_CHANGE")
        verify(client)
        emit("PREVIEW_V2_STORAGE_ALREADY_PRESENT_NO_MUTATION")
        return
    emit("PREVIEW_V2_STORAGE_PREFLIGHT_PASSED", project=PROJECT, bucket_absent=True)
    if "firebasestorage.googleapis.com" not in services:
        emit("PREVIEW_V2_STORAGE_API_ENABLE_BEGIN")
        cloud("services", "enable", "firebasestorage.googleapis.com", "--quiet")
        emit("PREVIEW_V2_STORAGE_API_ENABLE_COMMAND_COMPLETED")
    # GET success/structured NOT_FOUND confirms the API can be queried after activation.
    if client.request("default", DEFAULT, missing=True) is not None:
        stop("DEFAULT_BUCKET_APPEARED_RETURN_OUTPUT_NO_CHANGE")
    release = client.request("rules", RELEASE, missing=True)
    if release is None:
        emit("PREVIEW_V2_DENY_ALL_RULESET_CREATE_BEGIN")
        ruleset = client.request("rules", PARENT + "/rulesets", body={"source": SOURCE})
        name = ruleset.get("name", "")
        if not isinstance(name, str) or not re.fullmatch(re.escape(PARENT) + r"/rulesets/[A-Za-z0-9_-]+", name):
            stop("CREATED_RULESET_UNCONFIRMED")
        client.ruleset = name
        emit("PREVIEW_V2_DENY_ALL_RELEASE_CREATE_BEGIN")
        client.request("rules", PARENT + "/releases", body={"name": RELEASE, "rulesetName": name})
        release = client.request("rules", RELEASE)
    check_rules(client, release)
    emit("PREVIEW_V2_DENY_ALL_RELEASE_VERIFIED_BEFORE_BUCKET")
    if any(b["name"] == BUCKET for b in buckets(client)):
        stop("BUCKET_APPEARED_RETURN_OUTPUT_NO_RELINK")
    client.allow_create = True
    emit("PREVIEW_V2_DEFAULT_BUCKET_CREATE_BEGIN", location=REGION)
    client.request("default", DEFAULT, body={"location": REGION})
    client.allow_create = False
    verify(client)
    emit("PREVIEW_V2_STORAGE_PROVISIONING_COMPLETED_APPLICATION_HELD")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True)
    parser.parse_args()
    client, services = preflight()
    run(client, services)


if __name__ == "__main__":
    main()
