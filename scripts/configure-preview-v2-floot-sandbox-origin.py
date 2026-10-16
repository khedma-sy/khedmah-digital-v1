#!/usr/bin/env python3
"""Add only the observed Floot sandbox origin to Preview Firebase key and Auth."""
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
PLANNED_HOST = "khedmah-pr-274-frontend-1044962071847.europe-west1.run.app"
DEPLOYED_HOST = "khedmah-pr-274-frontend-xlslq22k6a-ew.a.run.app"
AUTH_HOST = PROJECT + ".firebaseapp.com"
WEB_HOST = PROJECT + ".web.app"
PUBLISHED_FLOOT_HOST = "khedma-meeting.floot.app"
FLOOT_HOST = "5e271f43-96a6-40de-a634-ec3eae023a49.sandbox.floot.app"
FLOOT_ORIGIN = "https://" + FLOOT_HOST
BASE_DOMAINS = ["localhost", AUTH_HOST, WEB_HOST, PLANNED_HOST, DEPLOYED_HOST, PUBLISHED_FLOOT_HOST]
DESIRED_DOMAINS = BASE_DOMAINS + [FLOOT_HOST]
BASE_FIREBASE_REFS = ["https://" + h + suffix for h in (PLANNED_HOST, AUTH_HOST)
                      for suffix in ("", "/*")] + ["https://" + DEPLOYED_HOST,
                                                 "https://" + DEPLOYED_HOST + "/*"]
BASE_FIREBASE_REFS += ["https://" + PUBLISHED_FLOOT_HOST, "https://" + PUBLISHED_FLOOT_HOST + "/*"]
DESIRED_FIREBASE_REFS = BASE_FIREBASE_REFS + [FLOOT_ORIGIN, FLOOT_ORIGIN + "/*"]
FIREBASE_KEY = "projects/" + NUMBER + "/locations/global/keys/fdae1cd2-64ce-49ec-a426-ed46120083e9"
FIREBASE_UID = "fdae1cd2-64ce-49ec-a426-ed46120083e9"
KEY_ROOT = "https://apikeys.googleapis.com/v2/"
AUTH_ROOT = "https://identitytoolkit.googleapis.com/admin/v2/"
CONFIG_PATH = "projects/" + PROJECT + "/config"
GOOGLE_PATH = "projects/" + PROJECT + "/defaultSupportedIdpConfigs/google.com"
KEY_FIELDS = "name,uid,etag,restrictions,deleteTime,serviceAccountEmail"
OP_FIELDS = "name,done,error(code)"
CONFIG_FIELDS = "name,subtype,authorizedDomains,signIn(email(enabled,passwordRequired),anonymous(enabled),phoneNumber(enabled))"
FIREBASE_SERVICES = {
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


def cloud(*args, fields=None):
    command = ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
               "--user-output-enabled", "--verbosity=error"]
    if fields is not None:
        command.append("--format=json(" + fields + ")")
    try:
        result = subprocess.run(command, capture_output=True, timeout=90,
            env=dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="true",
                     CLOUDSDK_CORE_LOG_HTTP="false", CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                     CLOUDSDK_CORE_UNIVERSE_DOMAIN="googleapis.com",
                     CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true"))
    except (OSError, subprocess.TimeoutExpired):
        stop("GCLOUD_OPERATION_UNCONFIRMED_RECONCILE")
    if result.returncode:
        stop("GCLOUD_METADATA_FAILED_RECONCILE")
    if fields is None:
        return result.stdout
    try:
        return json.loads(result.stdout)
    except ValueError:
        stop("INVALID_GCLOUD_METADATA")


def preflight():
    if any(os.environ.get(k) for k in (
            "CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
            "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE")):
        stop("AUTH_OVERRIDE_PRESENT")
    if any(k.startswith("CLOUDSDK_API_ENDPOINT_OVERRIDES_") and v for k, v in os.environ.items()):
        stop("API_ENDPOINT_OVERRIDE_PRESENT")
    for key in ("impersonate_service_account", "access_token_file", "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key).strip() not in (b"", b"(unset)"):
            stop("AUTH_OVERRIDE_PRESENT")
    endpoints = cloud("config", "list", "api_endpoint_overrides/", fields="api_endpoint_overrides")
    if not isinstance(endpoints, dict) or endpoints.get("api_endpoint_overrides"):
        stop("API_ENDPOINT_OVERRIDE_PRESENT_OR_UNCONFIRMED")
    if cloud("auth", "list", "--filter=account=" + ACCOUNT, fields="account") != [{"account": ACCOUNT}]:
        stop("EXPECTED_ACCOUNT_NOT_AVAILABLE")
    project = cloud("projects", "describe", PROJECT,
                    fields="projectId,projectNumber,lifecycleState,parent")
    if (not isinstance(project, dict) or project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": ORGANIZATION}):
        stop("PROJECT_IDENTITY_MISMATCH")


def exact_list(value, before, after, code):
    if (not isinstance(value, list) or any(not isinstance(v, str) for v in value)
            or len(value) != len(set(value))):
        stop(code)
    current = set(value)
    if current not in (set(before), set(after)):
        stop(code)
    return current


def validate_targets(targets, expected):
    if not isinstance(targets, list) or len(targets) != len(expected):
        stop("API_ALLOWLIST_CONFLICT")
    services = []
    for target in targets:
        if (not isinstance(target, dict) or set(target) - {"service", "methods"}
                or not isinstance(target.get("service"), str) or target.get("methods", []) != []):
            stop("API_ALLOWLIST_CONFLICT")
        services.append(target["service"])
    if len(set(services)) != len(services) or set(services) != expected:
        stop("API_ALLOWLIST_CONFLICT")


def validate_key(value, name, uid, expected_services, before_refs, after_refs):
    if (not isinstance(value, dict) or value.get("name") != name or value.get("uid") != uid
            or value.get("deleteTime") or value.get("serviceAccountEmail")
            or not isinstance(value.get("etag"), str) or not value["etag"]):
        stop("KEY_IDENTITY_OR_ETAG_CONFLICT")
    restrictions = value.get("restrictions")
    if not isinstance(restrictions, dict) or set(restrictions) != {"apiTargets", "browserKeyRestrictions"}:
        stop("KEY_RESTRICTION_TYPE_CONFLICT")
    validate_targets(restrictions["apiTargets"], expected_services)
    browser = restrictions["browserKeyRestrictions"]
    if not isinstance(browser, dict) or set(browser) != {"allowedReferrers"}:
        stop("REFERRER_INVENTORY_CONFLICT")
    exact_list(browser["allowedReferrers"], before_refs, after_refs, "REFERRER_INVENTORY_CONFLICT")
    return set(browser["allowedReferrers"])


def validate_auth(value):
    if (not isinstance(value, dict)
            or value.get("name") not in (CONFIG_PATH, "projects/" + NUMBER + "/config")
            or value.get("subtype") != "FIREBASE_AUTH"):
        stop("AUTH_CONFIG_IDENTITY_CONFLICT")
    if json.dumps(value.get("signIn"), sort_keys=True) not in (
            "{}", json.dumps({"email": {"enabled": False, "passwordRequired": False},
                              "anonymous": {"enabled": False},
                              "phoneNumber": {"enabled": False}}, sort_keys=True)):
        stop("LOCAL_SIGN_IN_CONFLICT")
    exact_list(value.get("authorizedDomains"), BASE_DOMAINS, DESIRED_DOMAINS,
               "AUTH_DOMAIN_INVENTORY_CONFLICT")
    return set(value["authorizedDomains"])


def validate_google(value):
    if (not isinstance(value, dict) or value.get("enabled") is not True
            or value.get("name") not in (GOOGLE_PATH,
                "projects/" + NUMBER + "/defaultSupportedIdpConfigs/google.com")):
        stop("GOOGLE_PROVIDER_CONFLICT")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, kind, body=None, operation=None):
        resources = {
            "firebase": (KEY_ROOT, FIREBASE_KEY, KEY_FIELDS),
            "config": (AUTH_ROOT, CONFIG_PATH, CONFIG_FIELDS),
            "google": (AUTH_ROOT, GOOGLE_PATH, "name,enabled"),
        }
        if kind == "operation":
            if body is not None or not isinstance(operation, str) or not re.fullmatch(r"operations/[A-Za-z0-9_.-]{1,256}", operation):
                stop("OPERATION_SCOPE_REJECTED")
            root, path, fields = KEY_ROOT, operation, OP_FIELDS
        elif kind in resources and operation is None:
            root, path, fields = resources[kind]
        else:
            stop("REQUEST_SCOPE_REJECTED")
        if body is not None:
            if kind == "firebase":
                if set(body) != {"restrictions", "etag"} or not body.get("etag"):
                    stop("MUTATION_SCOPE_REJECTED")
                fields = OP_FIELDS
            elif kind == "config":
                if body != {"authorizedDomains": DESIRED_DOMAINS}:
                    stop("MUTATION_SCOPE_REJECTED")
            else:
                stop("MUTATION_SCOPE_REJECTED")
        query = {"fields": fields}
        if body is not None:
            query["updateMask"] = "restrictions" if kind == "firebase" else "authorizedDomains"
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


def wait_operation(client, result, stage):
    name = result.get("name")
    if not isinstance(name, str) or not re.fullmatch(r"operations/[A-Za-z0-9_.-]{1,256}", name):
        stop("OPERATION_ID_UNCONFIRMED_RECONCILE")
    print(json.dumps({"stage": stage, "operation": name}), flush=True)
    for attempt in range(16):
        if result.get("name") != name or type(result.get("done", False)) is not bool or "error" in result:
            stop("OPERATION_FAILED_OR_CHANGED_RECONCILE")
        if result.get("done") is True:
            return
        if attempt == 15:
            stop("OPERATION_PENDING_RECONCILE_NO_BLIND_RETRY")
        time.sleep(2)
        result = client.request("operation", operation=name)


def patch_key(client, kind, before, desired_refs, expected_services, stage):
    if kind != "firebase" or desired_refs != DESIRED_FIREBASE_REFS:
        stop("MUTATION_SCOPE_REJECTED")
    desired = copy.deepcopy(before["restrictions"])
    desired["browserKeyRestrictions"] = {"allowedReferrers": desired_refs}
    print(json.dumps({"stage": stage + "_PATCH_BEGIN", "project": PROJECT,
                      "key_name": before["name"]}), flush=True)
    result = client.request(kind, {"restrictions": desired, "etag": before["etag"]})
    wait_operation(client, result, stage + "_OPERATION")
    after = client.request(kind)
    name, uid = FIREBASE_KEY, FIREBASE_UID
    refs = validate_key(after, name, uid, expected_services,
                        desired_refs, desired_refs)
    if refs != set(desired_refs):
        stop("KEY_READBACK_MISMATCH")
    return after


def read_state(client):
    validate_google(client.request("google"))
    auth = client.request("config")
    domains = validate_auth(auth)
    key = client.request("firebase")
    refs = validate_key(key, FIREBASE_KEY, FIREBASE_UID, FIREBASE_SERVICES,
                        BASE_FIREBASE_REFS, DESIRED_FIREBASE_REFS)
    auth_present = domains == set(DESIRED_DOMAINS)
    refs_present = refs == set(DESIRED_FIREBASE_REFS)
    if auth_present != refs_present:
        stop("FLOOT_ORIGIN_PARTIAL_STATE_RECONCILE_NO_BLIND_RETRY")
    return auth, key, auth_present


def reconcile(client):
    auth_before, key_before, present = read_state(client)
    changed = False
    if not present:
        # Re-read the complete bounded metadata before the first mutation.
        fresh_auth, fresh_key, fresh_present = read_state(client)
        if fresh_present or fresh_auth != auth_before or fresh_key != key_before:
            stop("METADATA_CHANGED_RECONCILE")
        patch_key(client, "firebase", key_before, DESIRED_FIREBASE_REFS,
                  FIREBASE_SERVICES, "PREVIEW_V2_FLOOT_SANDBOX_FIREBASE")
        # Auth has no etag CAS here; stop on observed drift. Concurrent changes
        # between this read and PATCH remain a documented API limitation.
        validate_google(client.request("google"))
        fresh = client.request("config")
        validate_auth(fresh)
        if fresh != auth_before:
            stop("AUTH_CONFIG_CHANGED_RECONCILE")
        print(json.dumps({"stage": "PREVIEW_V2_FLOOT_SANDBOX_AUTH_PATCH_BEGIN",
                          "project": PROJECT, "authorized_domain": FLOOT_HOST}), flush=True)
        patched = client.request("config", {"authorizedDomains": DESIRED_DOMAINS})
        if (validate_auth(patched) != set(DESIRED_DOMAINS)
                or patched.get("signIn") != auth_before.get("signIn")):
            stop("AUTH_PATCH_UNCONFIRMED_RECONCILE")
        changed = True
    auth_after, key_after, present_after = read_state(client)
    if not present_after or auth_after.get("signIn") != auth_before.get("signIn"):
        stop("FINAL_READBACK_MISMATCH_RECONCILE")
    if key_after["restrictions"]["apiTargets"] != key_before["restrictions"]["apiTargets"]:
        stop("API_TARGETS_CHANGED_RECONCILE")
    print(json.dumps(dict(stage="PREVIEW_V2_FLOOT_SANDBOX_ORIGIN_CONFIGURED",
        project=PROJECT, floot_origin=FLOOT_ORIGIN, changed=changed,
        authorized_domains=DESIRED_DOMAINS, firebase_referrers=DESIRED_FIREBASE_REFS,
        firebase_api_target_count=len(FIREBASE_SERVICES),
        firebase_api_allowlist_preserved=True, google_provider_enabled=True,
        local_sign_in_unchanged=True, maps_mutation=False,
        credential_values_printed=False, key_payload_access=False,
        secret_payload_access=False, application_deployed=False,
        production_mutation=False, login_flow_verified=False, floot_connected=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),
        sort_keys=True))


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
    except (OSError, ValueError, TypeError, KeyError, EOFError, KeyboardInterrupt):
        stop("LOCAL_OR_METADATA_FAILURE_RECONCILE")
