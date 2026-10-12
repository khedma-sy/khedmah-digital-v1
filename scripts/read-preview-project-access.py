#!/usr/bin/env python3
"""Read two Preview provisioning permissions; never creates or changes resources."""

import argparse
import json
import os
import re
import subprocess
import urllib.error
import urllib.request

ACCOUNT = "haifawi30@gmail.com"
ORGANIZATION = "594049370623"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def cloud(*args):
    env = dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false",
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true")
    try:
        result = subprocess.run(
            ["gcloud", *args, "--account=" + ACCOUNT,
             "--user-output-enabled", "--verbosity=error"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True,
            env=env, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit("STOP: GCLOUD_READ_FAILED") from None
    if result.returncode:
        raise SystemExit("STOP: GCLOUD_READ_FAILED")
    return result.stdout.strip()


def run(billing_account):
    if not re.fullmatch(r"[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}", billing_account):
        raise SystemExit("STOP: INVALID_BILLING_ACCOUNT")

    for key in ("impersonate_service_account", "access_token_file",
                "credential_file_override"):
        if cloud("config", "get-value", "auth/" + key) not in ("", "(unset)"):
            raise SystemExit("STOP: AUTH_OVERRIDE_PRESENT")

    token = cloud("auth", "print-access-token")
    if not token or any(c.isspace() for c in token):
        raise SystemExit("STOP: TOKEN_UNAVAILABLE")

    opener = urllib.request.build_opener(NoRedirect)
    checks = [
        ("PROJECT_CREATE",
         "https://cloudresourcemanager.googleapis.com/v3/organizations/"
         + ORGANIZATION + ":testIamPermissions",
         "resourcemanager.projects.create"),
        ("BILLING_LINK",
         "https://cloudbilling.googleapis.com/v1/billingAccounts/"
         + billing_account + ":testIamPermissions",
         "billing.resourceAssociations.create"),
    ]
    passed = True
    for label, url, permission in checks:
        request = urllib.request.Request(
            url, data=json.dumps({"permissions": [permission]}).encode(),
            headers={"Authorization": "Bearer " + token,
                     "Content-Type": "application/json"}, method="POST")
        try:
            with opener.open(request, timeout=30) as response:
                data = json.loads(response.read(65536))
            granted = data.get("permissions", []) if isinstance(data, dict) else None
            if not isinstance(granted, list) or any(p != permission for p in granted):
                raise ValueError()
        except urllib.error.HTTPError as error:
            raise SystemExit(label + ": STOP_HTTP_" + str(error.code)) from None
        except (ValueError, OSError):
            raise SystemExit(label + ": STOP_READ_FAILED") from None
        allowed = permission in granted
        passed = passed and allowed
        print(json.dumps({"check": label, "allowed": allowed, "read_only": True}))

    if not passed:
        raise SystemExit("STOP: REQUIRED_PERMISSION_MISSING")
    print("PREVIEW_PARENT_AND_BILLING_IAM_PASSED_NO_MUTATION")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--billing-account", required=True)
    run(parser.parse_args().billing_account)
