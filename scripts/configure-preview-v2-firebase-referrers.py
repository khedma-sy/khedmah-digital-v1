#!/usr/bin/env python3
"""Constrain one Preview Firebase browser key, preserving its API allowlist."""
import copy
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
HOST = "khedmah-pr-274-frontend-1044962071847.europe-west1.run.app"
AUTH_HOST = PROJECT + ".firebaseapp.com"
DOMAINS = ["localhost", AUTH_HOST, PROJECT + ".web.app", HOST]
REFERRERS = ["https://" + host + suffix
             for host in (HOST, AUTH_HOST) for suffix in ("", "/*")]
KEY = "projects/" + NUMBER + "/locations/global/keys/fdae1cd2-64ce-49ec-a426-ed46120083e9"
KEY_ROOT = "https://apikeys.googleapis.com/v2/"
AUTH_ROOT = "https://identitytoolkit.googleapis.com/admin/v2/"
CONFIG_PATH = "projects/" + PROJECT + "/config"
GOOGLE_PATH = "projects/" + PROJECT + "/defaultSupportedIdpConfigs/google.com"
KEY_FIELDS = "name,uid,etag,restrictions,deleteTime,serviceAccountEmail"
OP_FIELDS = "name,done,error(code)"
EXPECTED_SERVICES = {
    "firebasedatabase.googleapis.com", "firebasehosting.googleapis.com",
    "firebaserules.googleapis.com", "sqladmin.googleapis.com", "cloudconfig.googleapis.com",
    "datastore.googleapis.com", "fcmregistrations.googleapis.com", "firebase.googleapis.com",
    "firebaseappcheck.googleapis.com", "firebaseappdistribution.googleapis.com",
    "firebaseapphosting.googleapis.com", "firebaseapptesters.googleapis.com",
    "firebasedataconnect.googleapis.com", "firebaseinappmessaging.googleapis.com",
    "firebaseinstallations.googleapis.com", "firebaseml.googleapis.com",
    "firebaseremoteconfig.googleapis.com", "firebaseremoteconfigrealtime.googleapis.com",
    "firebasestorage.googleapis.com", "firebasevertexai.googleapis.com",
    "firestore.googleapis.com", "identitytoolkit.googleapis.com", "logging.googleapis.com",
    "mlkit.googleapis.com", "play.googleapis.com", "securetoken.googleapis.com",
    "fpnv.googleapis.com",
}


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
    # Refuse configured endpoint overrides before obtaining an access token.
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



def validate_restrictions(value):
    if not isinstance(value, dict) or set(value) != {"apiTargets", "browserKeyRestrictions"}:
        stop("KEY_RESTRICTION_TYPE_CONFLICT")
    targets = value["apiTargets"]
    if not isinstance(targets, list) or len(targets) != len(EXPECTED_SERVICES):
        stop("API_ALLOWLIST_CONFLICT")
    services = []
    for target in targets:
        if (not isinstance(target, dict) or set(target) - {"service", "methods"}
                or not isinstance(target.get("service"), str) or target.get("methods", []) != []):
            stop("API_ALLOWLIST_CONFLICT")
        services.append(target["service"])
    if len(set(services)) != len(services) or set(services) != EXPECTED_SERVICES:
        stop("API_ALLOWLIST_CONFLICT")
    browser = value["browserKeyRestrictions"]
    if not isinstance(browser, dict) or set(browser) - {"allowedReferrers"}:
        stop("REFERRER_INVENTORY_CONFLICT")
    refs = browser.get("allowedReferrers", [])
    if (not isinstance(refs, list) or any(not isinstance(v, str) for v in refs)
            or len(set(refs)) != len(refs) or (refs and set(refs) != set(REFERRERS))):
        stop("REFERRER_INVENTORY_CONFLICT")
    return refs


def validate_key(value):
    if (not isinstance(value, dict) or value.get("name") != KEY
            or value.get("deleteTime") or value.get("serviceAccountEmail")
            or not isinstance(value.get("uid"), str)
            or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
                                value["uid"])
            or not isinstance(value.get("etag"), str) or not value["etag"]):
        stop("KEY_IDENTITY_OR_ETAG_UNCONFIRMED")
    return validate_restrictions(value.get("restrictions"))


def verify_auth(config, provider):
    domains = config.get("authorizedDomains")
    if (config.get("name") not in (CONFIG_PATH, "projects/" + NUMBER + "/config")
            or config.get("subtype") != "FIREBASE_AUTH"
            or not isinstance(domains, list) or any(not isinstance(v, str) for v in domains)
            or len(domains) != len(DOMAINS) or set(domains) != set(DOMAINS)):
        stop("AUTH_DOMAIN_PREREQUISITE_CONFLICT")
    if (provider.get("enabled") is not True or provider.get("name") not in
            (GOOGLE_PATH, "projects/" + NUMBER + "/defaultSupportedIdpConfigs/google.com")):
        stop("GOOGLE_PROVIDER_PREREQUISITE_CONFLICT")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, kind, body=None, operation=None):
        if kind not in ("key", "config", "google", "operation"):
            stop("REQUEST_SCOPE_REJECTED")
        if body is not None:
            if (kind != "key" or not isinstance(body, dict)
                    or set(body) != {"restrictions", "etag"}
                    or not isinstance(body["etag"], str) or not body["etag"]):
                stop("MUTATION_SCOPE_REJECTED")
            if set(validate_restrictions(body["restrictions"])) != set(REFERRERS):
                stop("MUTATION_SCOPE_REJECTED")
        if kind == "operation":
            if (body is not None or not isinstance(operation, str)
                    or not re.fullmatch(r"operations/[A-Za-z0-9_.-]{1,256}", operation)):
                stop("OPERATION_SCOPE_REJECTED")
            root, path, fields = KEY_ROOT, operation, OP_FIELDS
        else:
            if operation is not None:
                stop("OPERATION_SCOPE_REJECTED")
            root, path, fields = {
                "key": (KEY_ROOT, KEY, OP_FIELDS if body is not None else KEY_FIELDS),
                "config": (AUTH_ROOT, CONFIG_PATH, "name,subtype,authorizedDomains"),
                "google": (AUTH_ROOT, GOOGLE_PATH, "name,enabled"),
            }[kind]
        query = {"fields": fields}
        if body is not None:
            query["updateMask"] = "restrictions"
        request = urllib.request.Request(root + path + "?" + urllib.parse.urlencode(query),
            data=None if body is None else json.dumps(body).encode(),
            method="GET" if body is None else "PATCH",
            headers={"Authorization": "Bearer " + self.token, "x-goog-user-project": PROJECT,
                     "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=45) as response:
                raw = response.read(65537)
            if len(raw) > 65536:
                stop("RESPONSE_TOO_LARGE")
            value = json.loads(raw)
            if not isinstance(value, dict):
                stop("INVALID_METADATA")
            return value
        except urllib.error.HTTPError as error:
            stop("HTTP_" + str(error.code) + "_RECONCILE_NO_BLIND_RETRY")
        except (OSError, ValueError):
            stop("REQUEST_UNCONFIRMED_RECONCILE_NO_BLIND_RETRY")


def wait_operation(client, result):
    name = result.get("name")
    if not isinstance(name, str) or not re.fullmatch(r"operations/[A-Za-z0-9_.-]{1,256}", name):
        stop("OPERATION_ID_UNCONFIRMED_RECONCILE")
    # Emit only the validated nonsecret operation name for timeout reconciliation.
    print(json.dumps({"stage": "PREVIEW_V2_FIREBASE_REFERRERS_OPERATION", "operation": name}), flush=True)
    for attempt in range(16):
        if result.get("name") != name or type(result.get("done", False)) is not bool:
            stop("OPERATION_METADATA_CONFLICT_RECONCILE")
        if "error" in result:
            stop("KEY_PATCH_OPERATION_FAILED_RECONCILE")
        if result.get("done") is True:
            return
        if attempt == 15:
            stop("KEY_PATCH_PENDING_RECONCILE_NO_BLIND_RETRY")
        time.sleep(2)
        result = client.request("operation", operation=name)


def reconcile(client):
    verify_auth(client.request("config"), client.request("google"))
    before = client.request("key")
    refs = validate_key(before)
    changed = False
    if not refs:
        desired = copy.deepcopy(before["restrictions"])
        desired["browserKeyRestrictions"] = {"allowedReferrers": REFERRERS}
        print(json.dumps({"stage": "PREVIEW_V2_FIREBASE_REFERRERS_PATCH_BEGIN",
                          "project": PROJECT, "key_name": KEY}), flush=True)
        result = client.request("key", body={"restrictions": desired, "etag": before["etag"]})
        wait_operation(client, result)
        changed = True
    after = client.request("key")
    if (set(validate_key(after)) != set(REFERRERS) or after["uid"] != before["uid"]
            or sorted((v["service"], tuple(v.get("methods", []))) for v in after["restrictions"]["apiTargets"])
            != sorted((v["service"], tuple(v.get("methods", []))) for v in before["restrictions"]["apiTargets"])):
        stop("KEY_READBACK_MISMATCH_RECONCILE")
    verify_auth(client.request("config"), client.request("google"))
    print(json.dumps(dict(stage="PREVIEW_V2_FIREBASE_REFERRERS_CONFIGURED",
        project=PROJECT, key_name=KEY, key_uid=after["uid"], changed=changed,
        allowed_referrers=after["restrictions"]["browserKeyRestrictions"]["allowedReferrers"],
        api_allowlist_preserved=True, api_target_count=len(EXPECTED_SERVICES),
        auth_domains_verified=True, google_provider_enabled=True,
        key_payload_access=False, secret_payload_access=False, credential_values_printed=False,
        propagation_and_browser_acceptance_verified=False, deployed_origin_verified=False,
        login_flow_verified=False, application_deployed=False, floot_connected=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()), sort_keys=True))


def run():
    preflight()
    token = cloud("auth", "print-access-token").decode("ascii").strip()
    if not token or any(c.isspace() for c in token):
        stop("TOKEN_UNAVAILABLE")
    reconcile(Client(token))


if __name__ == "__main__":
    if sys.argv[1:] != ["--apply"]:
        stop("USE_APPLY_ONLY_NO_CREDENTIAL_ARGUMENT")
    try:
        run()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError, KeyboardInterrupt):
        stop("LOCAL_OR_METADATA_FAILURE_RECONCILE")
