#!/usr/bin/env python3
"""Read-only review of lab/org IAM deny policy metadata. NOT effective IAM certification."""
import json
import os
import subprocess
import sys

TARGET = "khedmah-restore-lab-20261112"
ORGANIZATION = "594049370623"
ATTACHMENTS = {
    "lab": "cloudresourcemanager.googleapis.com/projects/" + TARGET,
    "organization": "cloudresourcemanager.googleapis.com/organizations/" + ORGANIZATION,
}
MAX_OUTPUT = 512 * 1024


def stop(code):
    raise SystemExit("STOP: " + code)


def read_policy_list(scope):
    if scope not in ATTACHMENTS:
        stop("UNKNOWN_ATTACHMENT_SCOPE")
    cmd = [
        "gcloud", "--quiet", "iam", "policies", "list",
        "--attachment-point=" + ATTACHMENTS[scope],
        "--kind=denypolicies", "--project=" + TARGET, "--format=json",
    ]
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1",
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true",
               CLOUDSDK_CORE_LOG_HTTP="false")
    try:
        result = subprocess.run(cmd, input=b"", capture_output=True,
                                timeout=45, check=False, env=env)
    except (OSError, subprocess.TimeoutExpired):
        stop("DENY_POLICY_READ_UNAVAILABLE")
    # No raw policy principals, permission lists, or stderr are printed.
    if result.returncode or not result.stdout or len(result.stdout) > MAX_OUTPUT:
        stop("DENY_POLICY_READ_UNAVAILABLE")
    try:
        value = json.loads(result.stdout)
    except (UnicodeDecodeError, ValueError):
        stop("DENY_POLICY_JSON_INVALID")
    if not isinstance(value, list):
        stop("DENY_POLICY_LIST_INCOMPLETE_OR_INVALID")
    for policy in value:
        if not isinstance(policy, dict) or not isinstance(policy.get("name"), str):
            stop("DENY_POLICY_LIST_INCOMPLETE_OR_INVALID")
        if not policy["name"]:
            stop("DENY_POLICY_LIST_INCOMPLETE_OR_INVALID")
    return value


def classify(lab, organization):
    if not isinstance(lab, list) or not isinstance(organization, list):
        stop("DENY_POLICY_LIST_INCOMPLETE_OR_INVALID")
    for policies in (lab, organization):
        for policy in policies:
            if not isinstance(policy, dict) or not isinstance(policy.get("name"), str) or not policy["name"]:
                stop("DENY_POLICY_LIST_INCOMPLETE_OR_INVALID")
    return {
        "target_project": TARGET,
        "organization": ORGANIZATION,
        "project_deny_policy_count": len(lab),
        "organization_deny_policy_count": len(organization),
        "denies_require_private_review": bool(lab or organization),
        "read_only": True,
        "cloud_resource_mutation": False,
        "effective_iam_verified": False,
        "principal_access_boundaries_verified": False,
        "private_network_verified": False,
        "all_in_quote_verified": False,
        "planning_budget_ceiling_usd": 20,
        "budget_is_hard_cloud_spend_cap": False,
        "paid_resource_setup_authorized": False,
        "restore_authorized": False,
        "production_release_authorized": False,
        "result": "DENY_POLICY_METADATA_ONLY_NO_GO",
    }


def main(argv):
    if argv != ["--inspect"]:
        stop("READ_ONLY_INSPECT_ONLY")
    lab = read_policy_list("lab")
    org = read_policy_list("organization")
    print(json.dumps(classify(lab, org), sort_keys=True))


if __name__ == "__main__":
    main(sys.argv[1:])
