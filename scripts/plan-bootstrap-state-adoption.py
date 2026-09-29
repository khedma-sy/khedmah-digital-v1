#!/usr/bin/env python3
"""Build a read-only bootstrap adoption manifest from an owner inventory report.

This tool never calls gcloud, Terraform, GitHub, Secret Manager, or any network API.
It reads one local JSON inventory produced by audit-new-google-hosting-readonly.py
and emits classifications only. It does not read secret payloads or mutate state.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT = "khedma-dl"
REGION = "europe-west1"

CANONICAL_SERVICE_ACCOUNTS = {
    "runtime": f"khedmah-v1-runtime@{PROJECT}.iam.gserviceaccount.com",
    "deployer": f"khedmah-v1-deployer@{PROJECT}.iam.gserviceaccount.com",
    "build": f"khedmah-v1-build@{PROJECT}.iam.gserviceaccount.com",
    "migration": f"khedmah-v1-migrator@{PROJECT}.iam.gserviceaccount.com",
}

LEGACY_SERVICE_ACCOUNTS = {
    "runtime": f"khedma-v1-runtime@{PROJECT}.iam.gserviceaccount.com",
    "deployer": f"khedma-v1-deployer@{PROJECT}.iam.gserviceaccount.com",
}

RUNTIME_SECRET_NAMES = {
    "DATABASE_URL",
    "FIREBASE_API_KEY",
    "FIREBASE_APP_ID",
    "GOOGLE_MAPS_BROWSER_API_KEY",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_OAUTH_SERVER_CLIENT_ID",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "OPERATIONS_PRODUCT_ROLE_BINDINGS",
    "RESEND_API_KEY",
}

SPECIAL_SECRET_NAMES = {
    "DATABASE_MIGRATION_URL",
    "GOOGLE_MAPS_ANDROID_API_KEY",
    "BOOTSTRAP_ADMIN_SECRET",
}

EXPECTED_WIF_POOL_SUFFIX = "/workloadIdentityPools/khedmah-github"
EXPECTED_WIF_PROVIDER_SUFFIX = "/workloadIdentityPools/khedmah-github/providers/github-actions"


def data(result):
    if not isinstance(result, dict) or result.get("status") != "COLLECTED":
        return None
    return result.get("data")


def emails(report):
    items = data(report["results"].get("service_accounts"))
    if not isinstance(items, list):
        return set()
    return {item.get("email") for item in items if isinstance(item, dict) and item.get("email")}


def secret_names(report):
    items = data(report["results"].get("secret_names"))
    if not isinstance(items, list):
        return set()
    names = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name", "")
        if name:
            names.add(name.rsplit("/", 1)[-1])
    return names


def artifact_repo_exists(report):
    items = data(report["results"].get("artifact_repositories"))
    if not isinstance(items, list):
        return False
    return any(
        isinstance(item, dict)
        and item.get("format") == "DOCKER"
        and str(item.get("name", "")).endswith("/repositories/khedmah-digital")
        for item in items
    )


def cloudbuild_bucket_exists(report):
    items = data(report["results"].get("buckets"))
    if not isinstance(items, list):
        return False
    return any(
        isinstance(item, dict)
        and item.get("name") == f"{PROJECT}-cloudbuild-source"
        and str(item.get("location", "")).upper() == "EUROPE-WEST1"
        for item in items
    )


def sql_classification(report):
    items = data(report["results"].get("sql_instances"))
    if not isinstance(items, list):
        return {"classification": "UNKNOWN", "reason": "SQL inventory unavailable"}
    instance = next((x for x in items if isinstance(x, dict) and x.get("name") == "khedmah-v1-db"), None)
    if not instance:
        return {"classification": "CREATE_LATER", "reason": "canonical Cloud SQL instance is absent"}

    settings = instance.get("settings") if isinstance(instance.get("settings"), dict) else {}
    backup = settings.get("backupConfiguration") if isinstance(settings.get("backupConfiguration"), dict) else {}
    exact_core = (
        instance.get("region") == REGION
        and instance.get("databaseVersion") == "POSTGRES_16"
        and settings.get("tier") == "db-f1-micro"
        and settings.get("availabilityType") == "ZONAL"
        and settings.get("deletionProtectionEnabled") is True
    )
    start_time = backup.get("startTime")
    if exact_core and start_time == "02:00":
        return {"classification": "IMPORT_CANDIDATE", "reason": "core SQL contract and backup start time match"}
    if exact_core:
        return {
            "classification": "IMPORT_THEN_REVIEW_DRIFT",
            "reason": f"core SQL contract matches but live backup startTime={start_time!r}, Terraform expects '02:00'",
        }
    return {"classification": "HOLD_CONFLICT", "reason": "live Cloud SQL core settings differ from canonical bootstrap contract"}


def database_exists(report):
    items = data(report["results"].get("sql_databases"))
    return isinstance(items, list) and any(isinstance(x, dict) and x.get("name") == "khedmah" for x in items)


def wif_classifications(report):
    pools = data(report["results"].get("wif_pools"))
    providers = data(report["results"].get("wif_providers"))

    pool = None
    if isinstance(pools, list):
        pool = next(
            (x for x in pools if isinstance(x, dict) and str(x.get("name", "")).endswith(EXPECTED_WIF_POOL_SUFFIX)),
            None,
        )
    provider = None
    if isinstance(providers, list):
        provider = next(
            (
                x
                for x in providers
                if isinstance(x, dict)
                and str(x.get("name", "")).endswith(EXPECTED_WIF_PROVIDER_SUFFIX)
            ),
            None,
        )

    pool_result = (
        {"classification": "IMPORT_CANDIDATE", "reason": "canonical WIF pool exists and is ACTIVE"}
        if pool and pool.get("state") == "ACTIVE"
        else {"classification": "CREATE_LATER", "reason": "canonical WIF pool is absent or inactive"}
    )

    if not provider:
        provider_result = {"classification": "CREATE_LATER", "reason": "canonical WIF provider is absent"}
    elif provider.get("state") != "ACTIVE":
        provider_result = {"classification": "HOLD_CONFLICT", "reason": "canonical WIF provider is not ACTIVE"}
    else:
        condition = str(provider.get("attributeCondition", ""))
        mapping = provider.get("attributeMapping") if isinstance(provider.get("attributeMapping"), dict) else {}
        issuer = (provider.get("oidc") or {}).get("issuerUri") if isinstance(provider.get("oidc"), dict) else None
        immutable_ids = (
            'attribute.repository_id == "1307435925"' in condition
            and 'attribute.repository_owner_id == "307214577"' in condition
            and 'attribute.ref == "refs/heads/main"' in condition
            and mapping.get("attribute.repository_id") == "assertion.repository_id"
            and mapping.get("attribute.repository_owner_id") == "assertion.repository_owner_id"
            and issuer == "https://token.actions.githubusercontent.com"
        )
        provider_result = {
            "classification": "IMPORT_THEN_REVIEW_DRIFT" if immutable_ids else "HOLD_CONFLICT",
            "reason": (
                "provider is ACTIVE and pins immutable repository IDs, but condition text differs from current Terraform"
                if immutable_ids
                else "provider identity contract does not fully match canonical bootstrap expectations"
            ),
        }
    return pool_result, provider_result


def build_manifest(report):
    if report.get("project") != PROJECT or report.get("region") != REGION:
        raise ValueError("inventory project/region does not match the canonical production target")
    if report.get("secretPayloadsRead") is not False or report.get("cloudMutations") is not False:
        raise ValueError("inventory is not proven metadata-only/read-only")

    results = report.get("results")
    if not isinstance(results, dict):
        raise ValueError("inventory results are missing")

    live_emails = emails(report)
    live_secrets = secret_names(report)
    pool, provider = wif_classifications(report)

    resources = []
    for role, email in CANONICAL_SERVICE_ACCOUNTS.items():
        resources.append(
            {
                "kind": "service_account",
                "name": role,
                "identity": email,
                "classification": "IMPORT_CANDIDATE" if email in live_emails else "CREATE_LATER",
                "reason": "canonical identity exists" if email in live_emails else "canonical identity is absent",
            }
        )

    for role, email in LEGACY_SERVICE_ACCOUNTS.items():
        if email in live_emails:
            resources.append(
                {
                    "kind": "legacy_service_account",
                    "name": role,
                    "identity": email,
                    "classification": "HOLD_LEGACY",
                    "reason": "live identity is outside the canonical Terraform naming contract; do not import into canonical address",
                }
            )

    resources.extend(
        [
            {
                "kind": "storage_bucket",
                "name": f"{PROJECT}-cloudbuild-source",
                "classification": "IMPORT_CANDIDATE" if cloudbuild_bucket_exists(report) else "CREATE_LATER",
                "reason": "canonical Cloud Build source bucket exists" if cloudbuild_bucket_exists(report) else "canonical bucket is absent",
            },
            {
                "kind": "artifact_registry",
                "name": "khedmah-digital",
                "classification": "IMPORT_CANDIDATE" if artifact_repo_exists(report) else "CREATE_LATER",
                "reason": "canonical Docker repository exists" if artifact_repo_exists(report) else "canonical Docker repository is absent",
            },
            {
                "kind": "cloud_sql_instance",
                "name": "khedmah-v1-db",
                **sql_classification(report),
            },
            {
                "kind": "cloud_sql_database",
                "name": "khedmah",
                "classification": "IMPORT_CANDIDATE" if database_exists(report) else "CREATE_LATER",
                "reason": "canonical database exists" if database_exists(report) else "canonical database is absent",
            },
            {"kind": "wif_pool", "name": "khedmah-github", **pool},
            {"kind": "wif_provider", "name": "github-actions", **provider},
        ]
    )

    for name in sorted(RUNTIME_SECRET_NAMES | SPECIAL_SECRET_NAMES):
        resources.append(
            {
                "kind": "secret_container",
                "name": name,
                "classification": "IMPORT_CANDIDATE" if name in live_secrets else "CREATE_LATER",
                "reason": "secret container exists; payload remains unmanaged by Terraform" if name in live_secrets else "secret container is absent",
            }
        )

    cloud_run = data(results.get("cloud_run_services"))
    services = cloud_run if isinstance(cloud_run, list) else None

    blockers = [
        "bootstrap Terraform state is not adopted; no state mutation is authorized by this manifest",
        "legacy khedma-v1-runtime/deployer identities must remain until canonical identities are created and verified",
        "WIF provider must be reviewed after import before any apply because its live condition text differs from current Terraform",
        "Cloud SQL must be reviewed after import before any apply because live backup scheduling differs from current Terraform",
    ]
    if services == []:
        blockers.append("no Cloud Run services are currently deployed in europe-west1; deployment remains a separate production gate")

    counts = {}
    for item in resources:
        key = item["classification"]
        counts[key] = counts.get(key, 0) + 1

    return {
        "mode": "READ_ONLY_BOOTSTRAP_ADOPTION_MANIFEST",
        "project": PROJECT,
        "region": REGION,
        "stateMutationAuthorized": False,
        "cloudMutationAuthorized": False,
        "secretPayloadsRequired": False,
        "summary": counts,
        "resources": resources,
        "blockers": blockers,
        "nextPhase": "review exact import IDs and IAM member instances; do not run terraform import/apply yet",
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path, help="hosting-inventory.json from the owner read-only audit")
    parser.add_argument("--json", action="store_true", help="emit full JSON manifest")
    args = parser.parse_args(argv)

    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
        manifest = build_manifest(report)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    else:
        print(f"MODE={manifest['mode']}")
        print(f"PROJECT={manifest['project']}")
        print(f"REGION={manifest['region']}")
        print("STATE_MUTATION_AUTHORIZED=false")
        print("CLOUD_MUTATION_AUTHORIZED=false")
        for key in sorted(manifest["summary"]):
            print(f"{key}={manifest['summary'][key]}")
        for item in manifest["resources"]:
            print(f"{item['classification']}\t{item['kind']}\t{item['name']}")
        print("NEXT=review exact import IDs and IAM member instances; no terraform import/apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
