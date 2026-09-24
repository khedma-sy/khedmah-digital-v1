#!/usr/bin/env python3
"""Owner-run hosting inventory; metadata only, never a Production certificate.

No authentication setup, API enablement, secret data access, Terraform operation,
SQL statement, build execution or deployment is performed. Run with Python 3.9+.
"""
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

PROJECT = "khedma-dl"
NUMBER = "311026134906"
REGION = "europe-west1"
ACCOUNT = "haifawi30@gmail.com"
SECRETS = (
    "DATABASE_URL", "DATABASE_MIGRATION_URL", "RESEND_API_KEY",
    "BOOTSTRAP_ADMIN_SECRET", "GOOGLE_OAUTH_SERVER_CLIENT_ID",
    "GOOGLE_MAPS_BROWSER_API_KEY", "GOOGLE_MAPS_ANDROID_API_KEY",
    "GOOGLE_MAPS_SERVER_API_KEY", "FIREBASE_API_KEY", "FIREBASE_APP_ID",
    "OPERATIONS_PRODUCT_ROLE_BINDINGS", "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID", "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
)
# Explicit read-operation allowlist. Flags cannot change the operation verb.
READS = (
    ("auth", "list"), ("config", "list"), ("projects", "describe"),
    ("projects", "get-iam-policy"), ("billing", "projects", "describe"),
    ("services", "list"), ("iam", "service-accounts", "list"),
    ("iam", "service-accounts", "keys", "list"),
    ("iam", "service-accounts", "get-iam-policy"),
    ("iam", "workload-identity-pools", "list"),
    ("iam", "workload-identity-pools", "providers", "list"),
    ("storage", "buckets", "list"), ("storage", "buckets", "get-iam-policy"),
    ("sql", "instances", "list"), ("sql", "databases", "list"),
    ("sql", "backups", "list"), ("secrets", "list"),
    ("secrets", "versions", "describe"), ("secrets", "get-iam-policy"),
    ("run", "services", "list"), ("run", "jobs", "list"),
    ("artifacts", "repositories", "list"), ("builds", "list"),
    ("builds", "triggers", "list"), ("builds", "connections", "list"),
    ("monitoring", "policies", "list"),
)


def failure_kind(stderr):
    text = stderr.upper()
    if "PERMISSION_DENIED" in text or "PERMISSION DENIED" in text or "403" in text:
        return "PERMISSION_DENIED"
    if "SERVICE_DISABLED" in text or "API HAS NOT BEEN USED" in text:
        return "API_NOT_ENABLED"
    if "UNAUTHENTICATED" in text or "NO CREDENTIALED" in text:
        return "AUTH_REQUIRED"
    if "NOT_FOUND" in text or "404" in text:
        return "NOT_FOUND"
    return "QUERY_ERROR"


class Audit:
    def __init__(self):
        self.results = {}
        self.enabled = set()
        self.env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1",
                        CLOUDSDK_CORE_LOG_HTTP="false")

    def query(self, label, args, projection, api=None, local=False):
        if not any(tuple(args[:len(prefix)]) == prefix for prefix in READS):
            raise ValueError("Operation is not on the read-only allowlist")
        if any(arg.startswith(("--flags-file", "--log-http", "--access-token",
                               "--impersonate", "--credential")) for arg in args):
            raise ValueError("Credential or flag overrides are not allowed")
        if api and api not in self.enabled:
            self.results[label] = {"status": "API_NOT_ENABLED", "api": api, "executed": False}
            return None
        cmd = ["gcloud", *args, "--format=" + projection, "--quiet"]
        if not local:
            cmd += ["--project=" + PROJECT, "--account=" + ACCOUNT]
        try:
            process = subprocess.run(cmd, env=self.env, text=True, capture_output=True, timeout=45)
            if process.returncode:
                # Do not export raw stderr: a local SDK configuration can contain
                # diagnostics or URLs not suitable for a shared inventory.
                self.results[label] = {"status": failure_kind(process.stderr),
                                       "exitCode": process.returncode, "executed": True}
                return None
            data = json.loads(process.stdout)
            prefix = next(p for p in READS if tuple(args[:len(p)]) == p)
            list_result = prefix[-1] == "list" and prefix != ("config", "list")
            if not isinstance(data, list if list_result else dict):
                raise ValueError("Unexpected response type")
        except subprocess.TimeoutExpired:
            self.results[label] = {"status": "TIMEOUT", "executed": True}
            return None
        except (OSError, ValueError):
            self.results[label] = {"status": "INVALID_OR_UNAVAILABLE_RESPONSE", "executed": True}
            return None
        self.results[label] = {"status": "COLLECTED", "data": data, "executed": True}
        return data

    def collect(self):
        if any(os.environ.get(k) for k in (
            "CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
            "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT")):
            raise RuntimeError("Credential override detected; inventory stopped without cloud calls")
        # An auth-only projection can serialize to JSON null when all selected
        # properties are unset. Include core identity instead of treating a null
        # command response (or any other failed query) as an empty success.
        context = self.query("sdk_credential_context", ["config", "list"],
                             "json(core.account,core.project,auth.impersonate_service_account,auth.credential_file_override,auth.access_token_file)", local=True)
        core = context.get("core") if isinstance(context, dict) else None
        auth = context.get("auth") if isinstance(context, dict) else None
        # Only the optional auth section may be omitted/null. The top-level
        # result must be an object with the expected account AND project.
        if auth is None:
            auth = {}
        if (not isinstance(core, dict) or core.get("account") != ACCOUNT or
                core.get("project") != PROJECT or not isinstance(auth, dict) or
                any(auth.get(key) not in (None, "") for key in (
                    "impersonate_service_account", "credential_file_override", "access_token_file"))):
            result = self.results["sdk_credential_context"]
            result.pop("data", None)
            if result["status"] == "COLLECTED":
                result["status"] = "UNVERIFIED_CREDENTIAL_CONTEXT"
            raise RuntimeError("SDK credential context is unverified; inventory stopped")
        accounts = self.query("accounts", ["auth", "list"], "json(account,status)", local=True)
        if not isinstance(accounts, list) or not any(x.get("account") == ACCOUNT for x in accounts):
            raise RuntimeError("Expected owner account is not available; no login or revoke was attempted")
        project = self.query("project", ["projects", "describe", PROJECT], "json(projectId,projectNumber,lifecycleState,labels)")
        if not isinstance(project, dict) or project.get("projectId") != PROJECT or str(project.get("projectNumber")) != NUMBER or project.get("lifecycleState") != "ACTIVE":
            raise RuntimeError("Project identity or state was not verified; inventory stopped")
        services = self.query("enabled_apis", ["services", "list", "--enabled"], "json(config.name)")
        if not isinstance(services, list):
            raise RuntimeError("Cannot verify enabled APIs; no service-specific calls will be made")
        self.enabled = {s.get("config", {}).get("name") for s in services}
        self.query("billing", ["billing", "projects", "describe", PROJECT], "json(projectId,billingEnabled)")
        self.query("project_iam", ["projects", "get-iam-policy", PROJECT], "json(bindings)")
        accounts = self.query("service_accounts", ["iam", "service-accounts", "list"], "json(email,disabled)", "iam.googleapis.com")
        for item in accounts or []:
            email = item.get("email", "")
            if not email.endswith("@" + PROJECT + ".iam.gserviceaccount.com"):
                continue
            self.query("account_iam:" + email, ["iam", "service-accounts", "get-iam-policy", email], "json(bindings)", "iam.googleapis.com")
            self.query("user_keys:" + email, ["iam", "service-accounts", "keys", "list", "--iam-account=" + email, "--managed-by=user"], "json(name,disabled,keyType,validBeforeTime)", "iam.googleapis.com")
        pools = self.query("wif_pools", ["iam", "workload-identity-pools", "list", "--location=global"], "json(name,state,disabled)", "iam.googleapis.com")
        for pool in pools or []:
            pool_id = pool.get("name", "").rsplit("/", 1)[-1]
            if pool_id == "khedmah-github":
                self.query("wif_providers", ["iam", "workload-identity-pools", "providers", "list", "--location=global", "--workload-identity-pool=" + pool_id], "json(name,state,disabled,attributeMapping,attributeCondition,oidc.issuerUri)", "iam.googleapis.com")
        buckets = self.query("buckets", ["storage", "buckets", "list"], "json(name,location,project_number,projectNumber,uniform_bucket_level_access,public_access_prevention,versioning_enabled,soft_delete_policy,iamConfiguration,versioning,softDeletePolicy)", "storage.googleapis.com")
        for bucket in buckets or []:
            name = bucket.get("name", "")
            if name in (PROJECT + "-khedmah-tfstate", PROJECT + "-khedmah-media", PROJECT + "-cloudbuild-source"):
                self.query("bucket_iam:" + name, ["storage", "buckets", "get-iam-policy", "gs://" + name], "json(bindings)", "storage.googleapis.com")
        instances = self.query("sql_instances", ["sql", "instances", "list"], "json(name,region,state,databaseVersion,settings.tier,settings.availabilityType,settings.backupConfiguration,settings.deletionProtectionEnabled,settings.ipConfiguration.sslMode)", "sqladmin.googleapis.com")
        for item in instances or []:
            name = item.get("name", "")
            if name == "khedmah-v1-db":
                self.query("sql_databases", ["sql", "databases", "list", "--instance=" + name], "json(name,charset,collation)", "sqladmin.googleapis.com")
                self.query("sql_backups_latest20", ["sql", "backups", "list", "--instance=" + name, "--limit=20"], "json(id,status,type,startTime,endTime)", "sqladmin.googleapis.com")
        secrets = self.query("secret_names", ["secrets", "list"], "json(name)", "secretmanager.googleapis.com")
        names = {s.get("name", "").rsplit("/", 1)[-1] for s in secrets or []}
        for secret in SECRETS:
            if secrets is None:
                self.results["secret:" + secret] = {"status": "UNKNOWN_INVENTORY", "executed": False}
            elif secret not in names:
                self.results["secret:" + secret] = {"status": "MISSING_FROM_SUCCESSFUL_LIST", "executed": False}
            else:
                self.query("secret_latest:" + secret, ["secrets", "versions", "describe", "latest", "--secret=" + secret], "json(name,state,createTime)", "secretmanager.googleapis.com")
                self.query("secret_iam:" + secret, ["secrets", "get-iam-policy", secret], "json(bindings)", "secretmanager.googleapis.com")
        self.query("cloud_run_services", ["run", "services", "list", "--region=" + REGION, "--platform=managed"], "json(metadata.name,status.latestReadyRevisionName,status.traffic,spec.template.spec.serviceAccountName,spec.template.spec.containers.image)", "run.googleapis.com")
        self.query("cloud_run_jobs", ["run", "jobs", "list", "--region=" + REGION], "json(metadata.name)", "run.googleapis.com")
        self.query("artifact_repositories", ["artifacts", "repositories", "list", "--location=" + REGION], "json(name,format)", "artifactregistry.googleapis.com")
        for location in (REGION, "global"):
            self.query("builds_latest10:" + location, ["builds", "list", "--region=" + location, "--limit=10"], "json(id,status,createTime,finishTime)", "cloudbuild.googleapis.com")
            self.query("build_triggers:" + location, ["builds", "triggers", "list", "--region=" + location], "json(id,name,disabled,serviceAccount,filename,approvalConfig)", "cloudbuild.googleapis.com")
        self.query("build_connections", ["builds", "connections", "list", "--region=" + REGION], "json(name,disabled,installationState)", "cloudbuild.googleapis.com")
        self.query("monitoring", ["monitoring", "policies", "list"], "json(name,enabled,combiner)", "monitoring.googleapis.com")


def main():
    os.umask(0o077)
    if not shutil.which("gcloud"):
        print("STOP: gcloud unavailable; nothing installed or changed")
        return 2
    audit = Audit()
    stopped = None
    try:
        audit.collect()
    except RuntimeError as error:
        stopped = str(error)
    unresolved = [k for k, v in audit.results.items() if v["status"] != "COLLECTED"]
    report = {"collectedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "project": PROJECT, "region": REGION, "mode": "OWNER_READ_ONLY_INVENTORY",
              "productionCertified": False, "secretPayloadsRead": False, "cloudMutations": False,
              "stopped": stopped, "unresolvedQueries": unresolved, "results": audit.results,
              "notCovered": ["GitHub protected variable/secret values", "Firebase user/config parity",
                             "SQL schema or data", "Terraform state content", "live user journeys",
                             "independent Gate D verifier", "restore/rollback exercise", "physical Android device"]}
    directory = Path(tempfile.mkdtemp(prefix="khedmah-hosting-audit-", dir=str(Path.home())))
    path = directory / "hosting-inventory.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("REPORT=" + str(path))
    print("QUERIES=" + str(len(audit.results)))
    print("UNRESOLVED=" + str(len(unresolved)))
    print("STOP=" + str(stopped) if stopped else "INVENTORY_COMPLETE_NOT_PRODUCTION_CERTIFIED")
    print("NO_SECRET_PAYLOADS_NO_CLOUD_MUTATIONS")
    return 2 if stopped or unresolved else 0


if __name__ == "__main__":
    raise SystemExit(main())
