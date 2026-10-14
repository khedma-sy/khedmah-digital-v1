#!/usr/bin/env python3
"""Read only: compare the exact Floot origin with Preview Firebase controls."""
import datetime
import importlib.util
import json
from pathlib import Path
import sys


SOURCE = Path(__file__).with_name("configure-preview-v2-deployed-origin.py")
SPEC = importlib.util.spec_from_file_location("preview_deployed_origin", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("STOP: REVIEWED_SOURCE_UNAVAILABLE")
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)

FLOOT_HOST = "khedma-meeting.floot.app"
FLOOT_ORIGIN = "https://" + FLOOT_HOST
CURRENT_DOMAINS = list(BASE.DESIRED_DOMAINS)
FLOOT_DOMAINS = CURRENT_DOMAINS + [FLOOT_HOST]
CURRENT_REFS = list(BASE.DESIRED_FIREBASE_REFS)
FLOOT_REFS = CURRENT_REFS + [FLOOT_ORIGIN, FLOOT_ORIGIN + "/*"]
EXPECTED_SIGN_IN = {
    "email": {"enabled": False, "passwordRequired": False},
    "anonymous": {"enabled": False},
    "phoneNumber": {"enabled": False},
}


def stop(code):
    raise SystemExit("STOP: " + code)


def exact_inventory(value, before, after, code):
    if (not isinstance(value, list)
            or any(not isinstance(item, str) for item in value)
            or len(value) != len(set(value))):
        stop(code)
    observed = set(value)
    if observed not in (set(before), set(after)):
        stop(code)
    return observed


def inspect(client):
    google = client.request("google")
    BASE.validate_google(google)

    auth = client.request("config")
    if (not isinstance(auth, dict)
            or auth.get("name") not in (BASE.CONFIG_PATH,
                "projects/" + BASE.NUMBER + "/config")
            or auth.get("subtype") != "FIREBASE_AUTH"
            or auth.get("signIn") != EXPECTED_SIGN_IN):
        stop("AUTH_CONFIG_CONFLICT")
    domains = exact_inventory(auth.get("authorizedDomains"), CURRENT_DOMAINS,
                              FLOOT_DOMAINS, "AUTH_DOMAIN_INVENTORY_CONFLICT")

    key = client.request("firebase")
    if (not isinstance(key, dict) or key.get("name") != BASE.FIREBASE_KEY
            or key.get("uid") != BASE.FIREBASE_UID or key.get("deleteTime")
            or key.get("serviceAccountEmail")
            or not isinstance(key.get("etag"), str) or not key["etag"]):
        stop("FIREBASE_KEY_IDENTITY_CONFLICT")
    restrictions = key.get("restrictions")
    if (not isinstance(restrictions, dict)
            or set(restrictions) != {"apiTargets", "browserKeyRestrictions"}):
        stop("FIREBASE_KEY_RESTRICTION_CONFLICT")
    BASE.validate_targets(restrictions["apiTargets"], BASE.FIREBASE_SERVICES)
    browser = restrictions["browserKeyRestrictions"]
    if not isinstance(browser, dict) or set(browser) != {"allowedReferrers"}:
        stop("FIREBASE_REFERRER_CONFLICT")
    refs = exact_inventory(browser["allowedReferrers"], CURRENT_REFS, FLOOT_REFS,
                           "FIREBASE_REFERRER_INVENTORY_CONFLICT")

    domain_present = FLOOT_HOST in domains
    refs_present = {FLOOT_ORIGIN, FLOOT_ORIGIN + "/*"}.issubset(refs)
    if domain_present != refs_present:
        stop("FLOOT_ORIGIN_PARTIAL_STATE_RECONCILE")

    print(json.dumps({
        "stage": "PREVIEW_V2_FLOOT_ORIGIN_METADATA_READ_COMPLETED",
        "project": BASE.PROJECT,
        "floot_origin": FLOOT_ORIGIN,
        "floot_origin_present": domain_present,
        "firebase_api_target_count": len(BASE.FIREBASE_SERVICES),
        "firebase_api_allowlist_verified": True,
        "google_provider_enabled": True,
        "local_sign_in_unchanged": True,
        "read_succeeded": True,
        "cloud_mutation": False,
        "key_payload_access": False,
        "secret_payload_access": False,
        "credential_values_printed": False,
        "application_deployed": False,
        "login_flow_verified": False,
        "production_mutation": False,
        "evidence_utc": datetime.datetime.now(
            datetime.timezone.utc).isoformat(),
    }, sort_keys=True))


def run():
    BASE.preflight()
    token = BASE.cloud("auth", "print-access-token").decode("ascii").strip()
    if not token or any(char.isspace() for char in token):
        stop("TOKEN_UNAVAILABLE")
    inspect(BASE.Client(token))


if __name__ == "__main__":
    if sys.argv[1:] != ["--inspect"]:
        stop("USE_INSPECT_ONLY_NO_CREDENTIAL_ARGUMENT")
    try:
        run()
    except (OSError, ValueError, TypeError, KeyError, EOFError, KeyboardInterrupt):
        stop("LOCAL_OR_METADATA_FAILURE_NO_MUTATION")

