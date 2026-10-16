#!/usr/bin/env python3
"""Add only the reviewed Preview frontend hostname to existing Firebase Auth."""
import datetime
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "khedmah-preview-v2-20261012"
NUMBER = "1044962071847"
ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"
HOST = "khedmah-pr-274-frontend-1044962071847.europe-west1.run.app"
BASE_DOMAINS = ["localhost", PROJECT + ".firebaseapp.com", PROJECT + ".web.app"]
DESIRED_DOMAINS = BASE_DOMAINS + [HOST]
AUTH_ROOT = "https://identitytoolkit.googleapis.com/admin/v2/"
CONFIG_PATH = "projects/" + PROJECT + "/config"
GOOGLE_PATH = "projects/" + PROJECT + "/defaultSupportedIdpConfigs/google.com"
CONFIG_FIELDS = "name,subtype,authorizedDomains,signIn(email(enabled,passwordRequired),anonymous(enabled),phoneNumber(enabled))"


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
    # Refuse configured endpoint overrides before transmitting any key.
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, kind, body=None):
        if kind not in ("config", "google"):
            stop("REQUEST_SCOPE_REJECTED")
        if body is not None and (kind != "config" or body != {"authorizedDomains": DESIRED_DOMAINS}):
            stop("MUTATION_SCOPE_REJECTED")
        path = CONFIG_PATH if kind == "config" else GOOGLE_PATH
        query = {"fields": CONFIG_FIELDS if kind == "config" else "name,enabled"}
        if body is not None:
            query["updateMask"] = "authorizedDomains"
        request = urllib.request.Request(AUTH_ROOT + path + "?" + urllib.parse.urlencode(query),
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
                stop("INVALID_AUTH_METADATA")
            return value
        except urllib.error.HTTPError as error:
            # Never forward raw response bodies, URLs, headers or credential data.
            stop("AUTH_HTTP_" + str(error.code) + "_RECONCILE")
        except (OSError, ValueError):
            stop("AUTH_REQUEST_UNCONFIRMED_RECONCILE")


def config_domains(value):
    if (not isinstance(value, dict)
            or value.get("name") not in (CONFIG_PATH, "projects/" + NUMBER + "/config")
            or value.get("subtype") != "FIREBASE_AUTH"):
        stop("AUTH_CONFIG_IDENTITY_OR_SUBTYPE_MISMATCH")
    domains = value.get("authorizedDomains")
    if (not isinstance(domains, list) or any(not isinstance(v, str) for v in domains)
            or len(domains) != len(set(domains))
            or set(domains) not in (set(BASE_DOMAINS), set(DESIRED_DOMAINS))):
        stop("AUTH_DOMAIN_INVENTORY_CONFLICT_NO_OVERWRITE")
    return domains


def verify_google(value):
    if (not isinstance(value, dict) or value.get("enabled") is not True
            or value.get("name") not in (GOOGLE_PATH,
                "projects/" + NUMBER + "/defaultSupportedIdpConfigs/google.com")):
        stop("GOOGLE_PROVIDER_NOT_VERIFIED_ENABLED")


def reconcile(client):
    before = client.request("config")
    domains = config_domains(before)
    verify_google(client.request("google"))
    changed = False
    if set(domains) == set(BASE_DOMAINS):
        # Config has no etag. Refuse observed concurrent changes; serialize writers.
        fresh = client.request("config")
        config_domains(fresh)
        if fresh != before:
            stop("AUTH_CONFIG_CHANGED_RECONCILE")
        print(json.dumps({"stage": "PREVIEW_V2_AUTH_DOMAIN_PATCH_BEGIN",
                          "project": PROJECT, "authorized_domain": HOST}), flush=True)
        receipt = client.request("config", {"authorizedDomains": DESIRED_DOMAINS})
        if set(config_domains(receipt)) != set(DESIRED_DOMAINS):
            stop("AUTH_DOMAIN_PATCH_UNCONFIRMED_RECONCILE")
        changed = True
    after = client.request("config")
    if set(config_domains(after)) != set(DESIRED_DOMAINS):
        stop("AUTH_DOMAIN_READBACK_MISMATCH")
    if after.get("signIn") != before.get("signIn"):
        stop("LOCAL_SIGN_IN_CHANGED_RECONCILE")
    verify_google(client.request("google"))
    print(json.dumps(dict(stage="PREVIEW_V2_AUTH_DOMAIN_CONFIGURED",
        project=PROJECT, added_domain=HOST, changed=changed,
        authorized_domains=after["authorizedDomains"], local_sign_in_unchanged=True,
        google_provider_enabled=True, credential_values_printed=False,
        secret_payload_access=False, firebase_key_referrers_configured=False,
        login_flow_verified=False, deployed_origin_verified=False,
        application_deployed=False, floot_connected=False,
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
    except (OSError, ValueError, TypeError, KeyError, EOFError, KeyboardInterrupt):
        stop("LOCAL_OR_METADATA_FAILURE_RECONCILE")
