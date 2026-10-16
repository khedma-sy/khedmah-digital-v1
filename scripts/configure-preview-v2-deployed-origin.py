#!/usr/bin/env python3
"""Allow the exact deployed Preview origin in Maps, Firebase key and Auth."""
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
BASE_DOMAINS = ["localhost", AUTH_HOST, WEB_HOST, PLANNED_HOST]
DESIRED_DOMAINS = BASE_DOMAINS + [DEPLOYED_HOST]
BASE_FIREBASE_REFS = ["https://" + h + suffix for h in (PLANNED_HOST, AUTH_HOST)
                      for suffix in ("", "/*")]
DESIRED_FIREBASE_REFS = BASE_FIREBASE_REFS + ["https://" + DEPLOYED_HOST,
                                               "https://" + DEPLOYED_HOST + "/*"]
BASE_MAPS_REFS = ["https://" + PLANNED_HOST + "/*"]
DESIRED_MAPS_REFS = BASE_MAPS_REFS + ["https://" + DEPLOYED_HOST + "/*"]
FIREBASE_KEY = "projects/" + NUMBER + "/locations/global/keys/fdae1cd2-64ce-49ec-a426-ed46120083e9"
FIREBASE_UID = "fdae1cd2-64ce-49ec-a426-ed46120083e9"
MAPS_KEY = "projects/" + NUMBER + "/locations/global/keys/khedmah-preview-v2-maps-browser"
MAPS_UID = "6fad46fb-229e-403e-8f60-530b4ab9c1ae"
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
            "maps": (KEY_ROOT, MAPS_KEY, KEY_FIELDS),
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
            if kind in ("firebase", "maps"):
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
            query["updateMask"] = "restrictions" if kind in ("firebase", "maps") else "authorizedDomains"
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
    desired = copy.deepcopy(before["restrictions"])
    desired["browserKeyRestrictions"] = {"allowedReferrers": desired_refs}
    print(json.dumps({"stage": stage + "_PATCH_BEGIN", "project": PROJECT,
                      "key_name": before["name"]}), flush=True)
    result = client.request(kind, {"restrictions": desired, "etag": before["etag"]})
    wait_operation(client, result, stage + "_OPERATION")
    after = client.request(kind)
    name, uid = (FIREBASE_KEY, FIREBASE_UID) if kind == "firebase" else (MAPS_KEY, MAPS_UID)
    refs = validate_key(after, name, uid, expected_services,
                        desired_refs, desired_refs)
    if refs != set(desired_refs):
        stop("KEY_READBACK_MISMATCH")
    return after


def reconcile(client):
    validate_google(client.request("google"))
    auth_before = client.request("config")
    auth_domains = validate_auth(auth_before)
    firebase_before = client.request("firebase")
    firebase_refs = validate_key(firebase_before, FIREBASE_KEY, FIREBASE_UID,
                                  FIREBASE_SERVICES, BASE_FIREBASE_REFS, DESIRED_FIREBASE_REFS)
    maps_before = client.request("maps")
    maps_refs = validate_key(maps_before, MAPS_KEY, MAPS_UID,
                              {"maps-backend.googleapis.com"}, BASE_MAPS_REFS, DESIRED_MAPS_REFS)
    changed = {"firebase_key": False, "maps_key": False, "auth_domains": False}
    if firebase_refs == set(BASE_FIREBASE_REFS):
        patch_key(client, "firebase", firebase_before, DESIRED_FIREBASE_REFS,
                  FIREBASE_SERVICES, "PREVIEW_V2_DEPLOYED_ORIGIN_FIREBASE")
        changed["firebase_key"] = True
    if maps_refs == set(BASE_MAPS_REFS):
        patch_key(client, "maps", maps_before, DESIRED_MAPS_REFS,
                  {"maps-backend.googleapis.com"}, "PREVIEW_V2_DEPLOYED_ORIGIN_MAPS")
        changed["maps_key"] = True
    if auth_domains == set(BASE_DOMAINS):
        fresh = client.request("config")
        validate_auth(fresh)
        if fresh != auth_before:
            stop("AUTH_CONFIG_CHANGED_RECONCILE")
        print(json.dumps({"stage": "PREVIEW_V2_DEPLOYED_ORIGIN_AUTH_PATCH_BEGIN",
                          "project": PROJECT, "authorized_domain": DEPLOYED_HOST}), flush=True)
        patched = client.request("config", {"authorizedDomains": DESIRED_DOMAINS})
        if validate_auth(patched) != set(DESIRED_DOMAINS):
            stop("AUTH_PATCH_UNCONFIRMED_RECONCILE")
        changed["auth_domains"] = True
    firebase_after = client.request("firebase")
    maps_after = client.request("maps")
    auth_after = client.request("config")
    validate_google(client.request("google"))
    if validate_key(firebase_after, FIREBASE_KEY, FIREBASE_UID, FIREBASE_SERVICES,
                    DESIRED_FIREBASE_REFS, DESIRED_FIREBASE_REFS) != set(DESIRED_FIREBASE_REFS):
        stop("FIREBASE_READBACK_MISMATCH")
    if validate_key(maps_after, MAPS_KEY, MAPS_UID, {"maps-backend.googleapis.com"},
                    DESIRED_MAPS_REFS, DESIRED_MAPS_REFS) != set(DESIRED_MAPS_REFS):
        stop("MAPS_READBACK_MISMATCH")
    if validate_auth(auth_after) != set(DESIRED_DOMAINS):
        stop("AUTH_READBACK_MISMATCH")
    if auth_after.get("signIn") != auth_before.get("signIn"):
        stop("LOCAL_SIGN_IN_CHANGED_RECONCILE")
    print(json.dumps(dict(stage="PREVIEW_V2_DEPLOYED_ORIGIN_CONFIGURED", project=PROJECT,
        deployed_origin="https://" + DEPLOYED_HOST, changed=changed,
        firebase_referrers=DESIRED_FIREBASE_REFS, maps_referrers=DESIRED_MAPS_REFS,
        authorized_domains=DESIRED_DOMAINS, firebase_api_allowlist_preserved=True,
        maps_api_allowlist_preserved=True, google_provider_enabled=True,
        local_sign_in_unchanged=True, credential_values_printed=False,
        key_payload_access=False, secret_payload_access=False, application_deployed=False,
        production_mutation=False, login_flow_verified=False, map_render_verified=False,
        floot_connected=False, evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),
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
