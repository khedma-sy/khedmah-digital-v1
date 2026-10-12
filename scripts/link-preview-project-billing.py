#!/usr/bin/env python3
"""Check and optionally link billing for the exact replacement Preview project."""

import argparse
import json
import os
import re
import subprocess
import urllib.error
import urllib.request

ACCOUNT = "haifawi30@gmail.com"
PROJECT = "khedmah-preview-v2-20261012"
PROJECT_NUMBER = "1044962071847"
ORGANIZATION = "594049370623"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def cloud(*args, mutation=False):
    env = dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true")
    failure = ("STOP: BILLING_LINK_RESULT_UNCERTAIN_READ_BACK_BEFORE_RETRY"
               if mutation else "STOP: GCLOUD_READ_FAILED")
    try:
        result = subprocess.run(
            ["gcloud", *args, "--account=" + ACCOUNT, "--project=" + PROJECT,
             "--user-output-enabled", "--verbosity=error"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True,
            env=env, timeout=90)
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit(failure) from None
    if result.returncode:
        raise SystemExit(failure)
    return result.stdout.strip()


def cloud_json(*args):
    try:
        data = json.loads(cloud(*args, "--format=json"))
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (ValueError, TypeError):
        raise SystemExit("STOP: INVALID_METADATA_RESPONSE") from None


def billing_state():
    data = cloud_json("billing", "projects", "describe", PROJECT)
    if (data.get("projectId") != PROJECT
            or type(data.get("billingEnabled")) is not bool
            or not isinstance(data.get("billingAccountName", ""), str)):
        raise SystemExit("STOP: BILLING_METADATA_MISMATCH")
    return data


def permission_check(token, label, url, permissions):
    request = urllib.request.Request(
        url, data=json.dumps({"permissions": permissions}).encode(),
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            data = json.loads(response.read(65536))
        granted = data.get("permissions", []) if isinstance(data, dict) else None
        if not isinstance(granted, list) or any(p not in permissions for p in granted):
            raise ValueError()
    except urllib.error.HTTPError as error:
        raise SystemExit(label + ": STOP_HTTP_" + str(error.code)) from None
    except (ValueError, OSError):
        raise SystemExit(label + ": STOP_READ_FAILED") from None
    allowed = all(p in granted for p in permissions)
    print(json.dumps({"check": label, "allowed": allowed, "read_only": True}))
    if not allowed:
        raise SystemExit("STOP: REQUIRED_PERMISSION_MISSING")


def run(billing_account, apply=False):
    if not re.fullmatch(r"[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}", billing_account):
        raise SystemExit("STOP: INVALID_BILLING_ACCOUNT")
    for key in ("impersonate_service_account", "access_token_file",
                "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key) not in ("", "(unset)"):
            raise SystemExit("STOP: AUTH_OVERRIDE_PRESENT")

    project = cloud_json("projects", "describe", PROJECT)
    if (project.get("projectId") != PROJECT
            or str(project.get("projectNumber")) != PROJECT_NUMBER
            or project.get("lifecycleState") != "ACTIVE"
            or project.get("parent") != {"type": "organization", "id": ORGANIZATION}
            or project.get("labels", {}).get("environment") != "preview"
            or project.get("labels", {}).get("application") != "khedmah"):
        raise SystemExit("STOP: PROJECT_IDENTITY_MISMATCH")
    expected = "billingAccounts/" + billing_account
    before = billing_state()
    if before.get("billingAccountName", "") not in ("", expected):
        raise SystemExit("STOP: DIFFERENT_BILLING_ACCOUNT_ALREADY_LINKED")
    if before.get("billingAccountName") == expected:
        if not before["billingEnabled"]:
            raise SystemExit("STOP: EXISTING_BILLING_LINK_NOT_ENABLED")
        print("PREVIEW_BILLING_ALREADY_LINKED_VERIFIED_NO_MUTATION")
        return
    if before["billingEnabled"]:
        raise SystemExit("STOP: INCONSISTENT_BILLING_STATE")

    account = cloud_json("billing", "accounts", "describe", billing_account)
    if account.get("name") != expected or account.get("open") is not True:
        raise SystemExit("STOP: BILLING_ACCOUNT_NOT_OPEN_OR_MISMATCH")
    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        raise SystemExit("STOP: TOKEN_UNAVAILABLE")
    permission_check(token, "NEW_PROJECT_BILLING_PERMISSIONS",
                     "https://cloudresourcemanager.googleapis.com/v3/projects/"
                     + PROJECT_NUMBER + ":testIamPermissions",
                     ["resourcemanager.projects.get",
                      "resourcemanager.projects.createBillingAssignment",
                      "serviceusage.services.list",
                      "serviceusage.effectivepolicy.get"])
    permission_check(token, "SELECTED_BILLING_ACCOUNT_PERMISSION",
                     "https://cloudbilling.googleapis.com/v1/" + expected
                     + ":testIamPermissions", ["billing.resourceAssociations.create"])

    # Refuse to overwrite an association added while the preflight was running.
    fresh = billing_state()
    if fresh.get("billingAccountName", "") or fresh["billingEnabled"]:
        raise SystemExit("STOP: BILLING_STATE_CHANGED_RECONCILE_BEFORE_RETRY")
    print("PREVIEW_BILLING_LINK_PREFLIGHT_PASSED")
    if not apply:
        print("PREVIEW_BILLING_PLAN_ONLY_NO_MUTATION")
        return
    print("STAGE_ATTEMPT=PREVIEW_BILLING_LINK", flush=True)
    cloud("billing", "projects", "link", PROJECT,
          "--billing-account=" + billing_account, "--format=json", mutation=True)
    after = billing_state()
    if after.get("billingAccountName") != expected or not after["billingEnabled"]:
        raise SystemExit("STOP: BILLING_LINK_READBACK_FAILED_NO_RETRY")
    print(json.dumps({"projectId": PROJECT, "projectNumber": PROJECT_NUMBER,
                      "billingEnabled": True, "billingAccountMatches": True}))
    print("PREVIEW_BILLING_LINK_VERIFIED")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--billing-account", required=True)
    parser.add_argument("--apply", action="store_true",
                        help="Link the supplied account after all checks pass.")
    args = parser.parse_args()
    run(args.billing_account, args.apply)
