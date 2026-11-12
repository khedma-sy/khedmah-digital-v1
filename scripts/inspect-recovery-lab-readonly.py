#!/usr/bin/env python3
"""Fixed-scope, read-only GCP Recovery Lab inventory. NEVER a release GO."""
import json
import os
import subprocess
import sys
from collections import Counter

TARGET = "khedmah-restore-lab-20261112"
NUMBER = "36942020932"
ORG = "594049370623"
MAX_BYTES = 1024 * 1024
QUERIES = {
    "identity": ("projects", "describe", TARGET, "--project=" + TARGET),
    "billing": ("billing", "projects", "describe", TARGET, "--project=" + TARGET),
    "services": ("services", "list", "--enabled", "--project=" + TARGET),
    "project_iam": ("projects", "get-iam-policy", TARGET, "--project=" + TARGET),
    "org_iam": ("organizations", "get-iam-policy", ORG, "--project=" + TARGET),
}


def stop(code):
    raise SystemExit("STOP: " + code)


def gcloud_read(key):
    if key not in QUERIES:
        stop("UNSUPPORTED_READ_SCOPE")
    cmd = ["gcloud", "--quiet", *QUERIES[key], "--format=json"]
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1",
               CLOUDSDK_CORE_LOG_HTTP="false", CLOUDSDK_CORE_USER_OUTPUT_ENABLED="true")
    try:
        r = subprocess.run(cmd, input=b"", stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=40, env=env, check=False)
    except (OSError, subprocess.TimeoutExpired):
        stop("CLOUD_READ_UNAVAILABLE")
    if r.returncode or not r.stdout or len(r.stdout) > MAX_BYTES:
        stop("CLOUD_READ_UNAVAILABLE")
    try:
        return json.loads(r.stdout)
    except (ValueError, UnicodeDecodeError):
        stop("CLOUD_RESPONSE_INVALID")


def classify(data):
    if not isinstance(data, dict) or set(data) != set(QUERIES):
        stop("INCOMPLETE_OBSERVATIONS")
    identity = data["identity"]
    if (not isinstance(identity, dict) or identity.get("projectId") != TARGET
            or str(identity.get("projectNumber")) != NUMBER
            or identity.get("lifecycleState") != "ACTIVE"
            or identity.get("parent") != {"type": "organization", "id": ORG}):
        stop("PROJECT_IDENTITY_MISMATCH")
    billing = data["billing"]
    if (not isinstance(billing, dict) or billing.get("projectId") != TARGET
            or billing.get("billingEnabled") is not False):
        stop("BILLING_NOT_DISABLED_OR_UNKNOWN")
    services = data["services"]
    if not isinstance(services, list) or services:
        stop("ENABLED_SERVICES_NOT_EMPTY_OR_UNKNOWN")
    project_policy = data["project_iam"]
    org_policy = data["org_iam"]
    if not all(isinstance(p, dict) and isinstance(p.get("bindings"), list)
               for p in (project_policy, org_policy)):
        stop("IAM_BINDINGS_UNKNOWN")
    project_roles = []
    for b in project_policy["bindings"]:
        if not isinstance(b, dict) or not isinstance(b.get("members"), list):
            stop("PROJECT_IAM_INVALID")
        if not all(isinstance(x, str) for x in b["members"]):
            stop("PROJECT_IAM_INVALID")
        project_roles.append(b.get("role"))
        if "condition" in b:
            stop("PROJECT_IAM_CONDITION_REQUIRES_REVIEW")
        if any(x in {"allUsers", "allAuthenticatedUsers"} for x in b["members"]):
            stop("PROJECT_PUBLIC_PRINCIPAL")
    if project_roles != ["roles/owner"]:
        stop("PROJECT_IAM_CHANGED_REVIEW_REQUIRED")
    types = Counter()
    for b in org_policy["bindings"]:
        if (not isinstance(b, dict) or not isinstance(b.get("members"), list)
                or not isinstance(b.get("role"), str)):
            stop("ORG_IAM_INVALID")
        if "condition" in b:
            stop("ORG_IAM_CONDITION_REQUIRES_REVIEW")
        for member in b["members"]:
            if not isinstance(member, str):
                stop("ORG_IAM_INVALID")
            types[member.split(":", 1)[0]] += 1
    if not types or set(types) != {"user", "serviceAccount"}:
        stop("ORG_PRINCIPAL_TYPES_NEED_REVIEW")
    return {
        "target_project": TARGET, "target_number": NUMBER,
        "target_identity_verified": True, "billing_disabled": True,
        "enabled_api_count": 0, "direct_project_roles": project_roles,
        "org_binding_principal_type_counts": dict(sorted(types.items())),
        "read_only": True, "cloud_resource_mutation": False,
        "effective_iam_verified": False, "network_isolation_verified": False,
        "pricing_approved": False, "restore_authorized": False,
        "production_release_authorized": False,
        "result": "INITIAL_INVENTORY_ONLY_NO_GO",
    }


def main(argv):
    if argv != ["--inspect"]:
        stop("READ_ONLY_INSPECT_ONLY")
    evidence = {name: gcloud_read(name) for name in QUERIES}
    print(json.dumps(classify(evidence), sort_keys=True))


if __name__ == "__main__":
    main(sys.argv[1:])
