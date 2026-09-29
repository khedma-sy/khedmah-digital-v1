#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${EXPECTED_STATE_GENERATION:?EXPECTED_STATE_GENERATION is required}"
: "${EXPECTED_STATE_LINEAGE:?EXPECTED_STATE_LINEAGE is required}"
: "${EXPECTED_STATE_SERIAL:?EXPECTED_STATE_SERIAL is required}"

GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-europe-west1}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-khedma-sy/khedmah-digital-v1}"
TF_STATE_BUCKET="${TF_STATE_BUCKET:-${GOOGLE_CLOUD_PROJECT}-khedmah-tfstate}"
TF_STATE_PREFIX="${TF_STATE_PREFIX:-khedmah/production/bootstrap}"
ADOPTION_MODE="${ADOPTION_MODE:-VERIFY}"
ADOPTION_CONFIRMATION="${ADOPTION_CONFIRMATION:-}"

CANONICAL_PROJECT="khedma-dl"
CANONICAL_PROJECT_NUMBER="311026134906"
CANONICAL_REGION="europe-west1"
CANONICAL_REPOSITORY="khedma-sy/khedmah-digital-v1"
CANONICAL_REPOSITORY_ID="1307435925"
CANONICAL_OWNER_ID="307214577"
CANONICAL_ENVIRONMENT="production"
CANONICAL_STATE_BUCKET="khedma-dl-khedmah-tfstate"
CANONICAL_STATE_PREFIX="khedmah/production/bootstrap"

test "$GOOGLE_CLOUD_PROJECT" = "$CANONICAL_PROJECT" || {
  echo "ERROR: adoption is locked to project $CANONICAL_PROJECT." >&2
  exit 2
}
test "$GOOGLE_CLOUD_REGION" = "$CANONICAL_REGION" || {
  echo "ERROR: adoption is locked to region $CANONICAL_REGION." >&2
  exit 2
}
test "$GITHUB_REPOSITORY" = "$CANONICAL_REPOSITORY" || {
  echo "ERROR: adoption is locked to repository $CANONICAL_REPOSITORY." >&2
  exit 2
}
test "$TF_STATE_BUCKET" = "$CANONICAL_STATE_BUCKET" || {
  echo "ERROR: adoption is locked to state bucket $CANONICAL_STATE_BUCKET." >&2
  exit 2
}
test "$TF_STATE_PREFIX" = "$CANONICAL_STATE_PREFIX" || {
  echo "ERROR: adoption is locked to state prefix $CANONICAL_STATE_PREFIX." >&2
  exit 2
}
[[ "$EXPECTED_STATE_GENERATION" =~ ^[0-9]+$ ]] || {
  echo "ERROR: EXPECTED_STATE_GENERATION must be numeric." >&2
  exit 2
}
[[ "$EXPECTED_STATE_SERIAL" =~ ^[0-9]+$ ]] || {
  echo "ERROR: EXPECTED_STATE_SERIAL must be numeric." >&2
  exit 2
}
[[ "$EXPECTED_STATE_LINEAGE" =~ ^[0-9a-fA-F-]{20,}$ ]] || {
  echo "ERROR: EXPECTED_STATE_LINEAGE has an invalid format." >&2
  exit 2
}

for command_name in gcloud terraform git jq sha256sum tar comm sort grep wc; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command_name" >&2
    exit 3
  }
done

terraform_version="$(terraform version -json | jq -r '.terraform_version // empty')"
[[ "$terraform_version" =~ ^([0-9]+)\.([0-9]+)(\.[0-9]+)?([+-].*)?$ ]] || {
  echo "ERROR: unable to determine Terraform version." >&2
  exit 3
}
terraform_major="${BASH_REMATCH[1]}"
terraform_minor="${BASH_REMATCH[2]}"
if (( terraform_major < 1 || (terraform_major == 1 && terraform_minor < 8) )); then
  echo "ERROR: Terraform 1.8.0 or newer is required. Detected: $terraform_version" >&2
  exit 3
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || {
  echo "ERROR: adoption requires a clean checkout." >&2
  exit 4
}
origin_url="$(git remote get-url origin)"
case "$origin_url" in
  "https://github.com/$CANONICAL_REPOSITORY"|"https://github.com/$CANONICAL_REPOSITORY.git"|"git@github.com:$CANONICAL_REPOSITORY.git"|"ssh://git@github.com/$CANONICAL_REPOSITORY.git") ;;
  *)
    echo "ERROR: origin must be the canonical repository." >&2
    exit 4
    ;;
esac

git fetch origin main --quiet
CURRENT_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
test "$CURRENT_SHA" = "$MAIN_SHA" || {
  echo "ERROR: adoption is locked to the exact latest origin/main commit." >&2
  exit 4
}
[[ "$CURRENT_SHA" =~ ^[0-9a-f]{40}$ ]]
SHA7="${CURRENT_SHA:0:7}"

active_project="$(gcloud config get-value project 2>/dev/null)"
test "$active_project" = "$CANONICAL_PROJECT" || {
  echo "ERROR: active gcloud project is not $CANONICAL_PROJECT." >&2
  exit 5
}
project_number="$(gcloud projects describe "$CANONICAL_PROJECT" --format='value(projectNumber)')"
test "$project_number" = "$CANONICAL_PROJECT_NUMBER" || {
  echo "ERROR: project number mismatch." >&2
  exit 5
}

state_uri="gs://$TF_STATE_BUCKET/$TF_STATE_PREFIX/default.tfstate"
state_meta="$(mktemp)"
state_snapshot="$(mktemp)"
bootstrap_source_root="$(mktemp -d)"
state_addresses_file=""
allowed_addresses_file=""
cleanup() {
  rm -f "$state_meta" "$state_snapshot"
  if [[ -n "$state_addresses_file" ]]; then rm -f "$state_addresses_file"; fi
  if [[ -n "$allowed_addresses_file" ]]; then rm -f "$allowed_addresses_file"; fi
  rm -rf "$bootstrap_source_root"
}
trap cleanup EXIT

gcloud storage buckets describe "gs://$CANONICAL_STATE_BUCKET"   --project="$CANONICAL_PROJECT" --raw --format=json |
jq -e --arg bucket "$CANONICAL_STATE_BUCKET" --arg location "EUROPE-WEST1" '
  .name == $bucket and .location == $location and
  ((.uniform_bucket_level_access == true) or (.iamConfiguration.uniformBucketLevelAccess.enabled == true)) and
  ((.public_access_prevention == "enforced") or (.iamConfiguration.publicAccessPrevention == "enforced")) and
  ((.versioning_enabled == true) or (.versioning.enabled == true))
' >/dev/null || {
  echo "ERROR: Terraform state bucket protections changed." >&2
  exit 6
}

gcloud storage objects describe "$state_uri"   --project="$CANONICAL_PROJECT" --raw --format=json >"$state_meta"
actual_generation="$(jq -r '.generation // empty' "$state_meta")"
test "$actual_generation" = "$EXPECTED_STATE_GENERATION" || {
  echo "ERROR: Terraform state generation changed since review." >&2
  echo "EXPECTED_STATE_GENERATION=$EXPECTED_STATE_GENERATION" >&2
  echo "ACTUAL_STATE_GENERATION=$actual_generation" >&2
  exit 6
}

gcloud storage cat "$state_uri" >"$state_snapshot"
actual_lineage="$(jq -r '.lineage // empty' "$state_snapshot")"
actual_serial="$(jq -r '.serial // empty' "$state_snapshot")"
test "$actual_lineage" = "$EXPECTED_STATE_LINEAGE" || {
  echo "ERROR: Terraform state lineage changed since review." >&2
  exit 6
}
test "$actual_serial" = "$EXPECTED_STATE_SERIAL" || {
  echo "ERROR: Terraform state serial changed since review." >&2
  exit 6
}

git archive --format=tar "$CURRENT_SHA" infra/iac/bootstrap | tar -xf - -C "$bootstrap_source_root"
BOOTSTRAP_TF_DIR="$bootstrap_source_root/infra/iac/bootstrap"
for source_file in main.tf variables.tf outputs.tf versions.tf .terraform.lock.hcl; do
  test -f "$BOOTSTRAP_TF_DIR/$source_file" || {
    echo "ERROR: canonical bootstrap source is incomplete: $source_file" >&2
    exit 7
  }
done

bootstrap_configuration_sha256() {
  local file digest_input
  digest_input="$(mktemp)"
  for file in main.tf variables.tf outputs.tf versions.tf .terraform.lock.hcl; do
    (
      cd "$BOOTSTRAP_TF_DIR"
      sha256sum "$file"
    ) >>"$digest_input"
  done
  sha256sum "$digest_input" | awk '{print $1}'
  rm -f "$digest_input"
}
CONFIGURATION_SHA256="$(bootstrap_configuration_sha256)"

terraform_vars=(
  "-var=project_id=$CANONICAL_PROJECT"
  "-var=region=$CANONICAL_REGION"
  "-var=source_commit_sha=$CURRENT_SHA"
  "-var=configuration_sha256=$CONFIGURATION_SHA256"
  "-var=terraform_state_bucket_name=$CANONICAL_STATE_BUCKET"
  "-var=artifact_registry_repository_id=khedmah-digital"
  "-var=cloud_sql_instance_id=khedmah-v1-db"
  "-var=cloud_sql_database_name=khedmah"
  "-var=cloud_sql_tier=db-f1-micro"
  "-var=runtime_service_account_id=khedmah-v1-runtime"
  "-var=deployer_service_account_id=khedmah-v1-deployer"
  "-var=build_service_account_id=khedmah-v1-build"
  "-var=migration_service_account_id=khedmah-v1-migrator"
  "-var=github_repository=$CANONICAL_REPOSITORY"
  "-var=github_repository_id=$CANONICAL_REPOSITORY_ID"
  "-var=github_repository_owner_id=$CANONICAL_OWNER_ID"
  "-var=github_environment=$CANONICAL_ENVIRONMENT"
  "-var=github_workflow_path=.github/workflows/production-operator-new-account.yml"
  '-var=github_additional_workflow_paths=[".github/workflows/production-operator.yml",".github/workflows/production-baseline-001-020.yml",".github/workflows/production-bootstrap-admin.yml",".github/workflows/production-migrations-025-034.yml",".github/workflows/production-database-role-bootstrap.yml",".github/workflows/terraform-media-apply.yml",".github/workflows/terraform-media-plan.yml",".github/workflows/terraform-media-state-handoff.yml",".github/workflows/terraform-client-maps-plan.yml",".github/workflows/terraform-client-maps-apply.yml",".github/workflows/android-release-certification.yml",".github/workflows/google-production-readiness.yml"]'
  '-var=github_ref=refs/heads/main'
  '-var=runtime_secret_names=["DATABASE_URL","FIREBASE_API_KEY","FIREBASE_APP_ID","GOOGLE_MAPS_BROWSER_API_KEY","GOOGLE_MAPS_SERVER_API_KEY","GOOGLE_OAUTH_SERVER_CLIENT_ID","NEXT_PUBLIC_FIREBASE_API_KEY","NEXT_PUBLIC_FIREBASE_APP_ID","NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN","NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID","NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID","NEXT_PUBLIC_FIREBASE_PROJECT_ID","NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET","OPERATIONS_PRODUCT_ROLE_BINDINGS","RESEND_API_KEY"]'
)

terraform -chdir="$BOOTSTRAP_TF_DIR" init   -input=false -lockfile=readonly -reconfigure   -backend-config="bucket=$CANONICAL_STATE_BUCKET"   -backend-config="prefix=$CANONICAL_STATE_PREFIX" >/dev/null
terraform -chdir="$BOOTSTRAP_TF_DIR" validate >/dev/null

allowed_addresses=(
  "google_artifact_registry_repository.docker"
  "google_iam_workload_identity_pool.github"
  "google_project_iam_custom_role.storage_bucket_policy_viewer"
  "google_service_account.build"
  "google_service_account.migration"
  "google_sql_database.application"
  "google_sql_database_instance.postgres"
  "google_storage_bucket.cloudbuild_source"
)
state_addresses_file="$(mktemp)"
allowed_addresses_file="$(mktemp)"
if ! terraform -chdir="$BOOTSTRAP_TF_DIR" state list >"$state_addresses_file"; then
  echo "ERROR: unable to read current bootstrap state." >&2
  exit 8
fi
sort -o "$state_addresses_file" "$state_addresses_file"
printf '%s\n' "${allowed_addresses[@]}" | sort >"$allowed_addresses_file"
unexpected_state="$(comm -23 "$state_addresses_file" "$allowed_addresses_file")"
if [[ -n "$unexpected_state" ]]; then
  echo "ERROR: bootstrap state contains resources outside guarded Foundation A adoption." >&2
  printf '%s\n' "$unexpected_state" >&2
  exit 8
fi

verify_absent_service_account() {
  local email="$1"
  local out err
  out="$(mktemp)"
  err="$(mktemp)"
  if gcloud iam service-accounts describe "$email" --project="$CANONICAL_PROJECT" >"$out" 2>"$err"; then
    rm -f "$out" "$err"
    echo "ERROR: canonical service account unexpectedly already exists: $email" >&2
    return 1
  fi
  if grep -Eiq '(NOT_FOUND|not found|404|does not exist|Unknown service account)' "$err"; then
    rm -f "$out" "$err"
    return 0
  fi
  echo "ERROR: unable to prove service account absence: $email" >&2
  rm -f "$out" "$err"
  return 1
}

verify_present_service_account() {
  local email="$1"
  gcloud iam service-accounts describe "$email" --project="$CANONICAL_PROJECT" --format='value(email)' |
    grep -F -x "$email" >/dev/null
}

verify_present_service_account "khedmah-v1-build@$CANONICAL_PROJECT.iam.gserviceaccount.com"
verify_present_service_account "khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com"
verify_present_service_account "khedma-v1-runtime@$CANONICAL_PROJECT.iam.gserviceaccount.com"
verify_present_service_account "khedma-v1-deployer@$CANONICAL_PROJECT.iam.gserviceaccount.com"
verify_absent_service_account "khedmah-v1-runtime@$CANONICAL_PROJECT.iam.gserviceaccount.com"
verify_absent_service_account "khedmah-v1-deployer@$CANONICAL_PROJECT.iam.gserviceaccount.com"

for sa in   "khedma-v1-runtime@$CANONICAL_PROJECT.iam.gserviceaccount.com"   "khedma-v1-deployer@$CANONICAL_PROJECT.iam.gserviceaccount.com"   "khedmah-v1-build@$CANONICAL_PROJECT.iam.gserviceaccount.com"   "khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com"; do
  test -z "$(gcloud iam service-accounts keys list     --iam-account="$sa" --managed-by=user --project="$CANONICAL_PROJECT"     --format='value(name)')" || {
      echo "ERROR: user-managed key found for $sa; adoption stopped." >&2
      exit 8
    }
done

services_count="$(gcloud run services list --project="$CANONICAL_PROJECT" --region="$CANONICAL_REGION" --format='value(metadata.name)' | wc -l | tr -d ' ')"
test "$services_count" = "0" || {
  echo "ERROR: Cloud Run services now exist; reviewed no-service adoption assumption is stale." >&2
  exit 8
}

for job in khedmah-database-role-inventory khedmah-database-role-prepare khedmah-database-role-verify; do
  job_sa="$(gcloud run jobs describe "$job" --project="$CANONICAL_PROJECT" --region="$CANONICAL_REGION" --format=json |
    jq -r '.spec.template.spec.template.spec.serviceAccountName // empty')"
  test "$job_sa" = "khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com" || {
    echo "ERROR: Cloud Run job identity drift: $job" >&2
    exit 8
  }
done

trigger_json="$(mktemp)"
gcloud builds triggers describe khedmah-production-trigger   --project="$CANONICAL_PROJECT" --region="$CANONICAL_REGION" --format=json >"$trigger_json"
jq -e --arg sa "projects/$CANONICAL_PROJECT/serviceAccounts/khedma-v1-deployer@$CANONICAL_PROJECT.iam.gserviceaccount.com" '
  .disabled == true and .serviceAccount == $sa
' "$trigger_json" >/dev/null || {
  echo "ERROR: legacy Production trigger state changed; adoption assumptions are stale." >&2
  rm -f "$trigger_json"
  exit 8
}
rm -f "$trigger_json"

gcloud storage buckets describe "gs://$CANONICAL_PROJECT-cloudbuild-source"   --project="$CANONICAL_PROJECT" --raw --format=json |
jq -e --arg project "$CANONICAL_PROJECT" --arg location "EUROPE-WEST1" '
  .name == ($project + "-cloudbuild-source") and
  .location == $location and
  ((.uniform_bucket_level_access == true) or (.iamConfiguration.uniformBucketLevelAccess.enabled == true)) and
  ((.public_access_prevention == "enforced") or (.iamConfiguration.publicAccessPrevention == "enforced")) and
  ((.versioning_enabled == true) or (.versioning.enabled == true))
' >/dev/null

gcloud artifacts repositories describe khedmah-digital   --location="$CANONICAL_REGION" --project="$CANONICAL_PROJECT" --format=json |
jq -e '.format == "DOCKER"' >/dev/null

sql_json="$(mktemp)"
gcloud sql instances describe khedmah-v1-db --project="$CANONICAL_PROJECT" --format=json >"$sql_json"
jq -e --arg region "$CANONICAL_REGION" '
  .name == "khedmah-v1-db" and
  .region == $region and
  .databaseVersion == "POSTGRES_16" and
  .state == "RUNNABLE" and
  .settings.tier == "db-f1-micro" and
  .settings.availabilityType == "ZONAL" and
  .settings.dataDiskType == "PD_SSD" and
  .settings.storageAutoResize == true and
  .settings.deletionProtectionEnabled == true
' "$sql_json" >/dev/null || {
  echo "ERROR: Cloud SQL immutable/safety baseline changed." >&2
  rm -f "$sql_json"
  exit 8
}
sql_backup_start="$(jq -r '.settings.backupConfiguration.startTime // empty' "$sql_json")"
sql_pitr_present="$(jq -r '.settings.backupConfiguration | has("pointInTimeRecoveryEnabled")' "$sql_json")"
rm -f "$sql_json"
echo "KNOWN_DRIFT: CLOUD_SQL_BACKUP_START=$sql_backup_start TERRAFORM_EXPECTS=02:00"
echo "KNOWN_DRIFT: CLOUD_SQL_PITR_FIELD_PRESENT=$sql_pitr_present TERRAFORM_EXPECTS=true"

gcloud sql databases list --instance=khedmah-v1-db --project="$CANONICAL_PROJECT" --format=json |
jq -e 'any(.[]; .name == "khedmah" and .charset == "UTF8")' >/dev/null

gcloud iam roles describe khedmahStorageBucketPolicyViewer   --project="$CANONICAL_PROJECT" --format=json |
jq -e '
  .name == "projects/khedma-dl/roles/khedmahStorageBucketPolicyViewer" and
  ((.includedPermissions // []) | sort) == (["storage.buckets.getIamPolicy"] | sort)
' >/dev/null

gcloud iam workload-identity-pools describe khedmah-github   --location=global --project="$CANONICAL_PROJECT" --format=json |
jq -e '.state == "ACTIVE"' >/dev/null

provider_json="$(mktemp)"
gcloud iam workload-identity-pools providers describe github-actions   --workload-identity-pool=khedmah-github --location=global   --project="$CANONICAL_PROJECT" --format=json >"$provider_json"
jq -e '
  .state == "ACTIVE" and
  .oidc.issuerUri == "https://token.actions.githubusercontent.com" and
  .attributeMapping["google.subject"] == "assertion.sub" and
  .attributeMapping["attribute.repository"] == "assertion.repository" and
  .attributeMapping["attribute.repository_id"] == "assertion.repository_id" and
  .attributeMapping["attribute.repository_owner_id"] == "assertion.repository_owner_id" and
  .attributeMapping["attribute.ref"] == "assertion.ref" and
  .attributeMapping["attribute.workflow_ref"] == "assertion.workflow_ref" and
  (.attributeCondition | contains("khedma-sy/khedmah-digital-v1")) and
  (.attributeCondition | contains("1307435925")) and
  (.attributeCondition | contains("307214577")) and
  (.attributeCondition | contains("refs/heads/main")) and
  (.attributeCondition | contains("environment:production"))
' "$provider_json" >/dev/null || {
  echo "ERROR: live WIF provider no longer satisfies reviewed immutable trust constraints." >&2
  rm -f "$provider_json"
  exit 8
}
rm -f "$provider_json"

echo "VERIFIED: exact main=$CURRENT_SHA"
echo "VERIFIED: state generation=$actual_generation lineage=$actual_lineage serial=$actual_serial"
echo "VERIFIED: current state contains only a resumable subset of Foundation A."
echo "VERIFIED: live Foundation A resources and migration jobs match reviewed identities."
echo "HOLD: canonical runtime/deployer accounts remain absent; legacy accounts remain unmanaged."
echo "HOLD: WIF provider exists but is excluded from Foundation A pending post-import plan review."

if [[ "$ADOPTION_MODE" == "VERIFY" ]]; then
  echo "NO_MUTATION: adoption verification complete."
  echo "NEXT_CONFIRMATION=IMPORT_KHEDMAH_BOOTSTRAP_FOUNDATION_A_${SHA7^^}"
  exit 0
fi

test "$ADOPTION_MODE" = "IMPORT_FOUNDATION_A" || {
  echo "ERROR: ADOPTION_MODE must be VERIFY or IMPORT_FOUNDATION_A." >&2
  exit 9
}
expected_confirmation="IMPORT_KHEDMAH_BOOTSTRAP_FOUNDATION_A_${SHA7^^}"
test "$ADOPTION_CONFIRMATION" = "$expected_confirmation" || {
  echo "ERROR: IMPORT_FOUNDATION_A requires confirmation: $expected_confirmation" >&2
  exit 9
}

backup_dir="$HOME/khedmah-state-backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_file="$backup_dir/bootstrap-before-foundation-a-${CURRENT_SHA}-serial-${actual_serial}.tfstate"
terraform -chdir="$BOOTSTRAP_TF_DIR" state pull >"$backup_file"
chmod 600 "$backup_file"
backup_sha="$(sha256sum "$backup_file" | awk '{print $1}')"
echo "STATE_BACKUP=$backup_file"
echo "STATE_BACKUP_SHA256=$backup_sha"

import_if_missing() {
  local address="$1"
  local import_id="$2"
  local current_state
  current_state="$(mktemp)"
  if ! terraform -chdir="$BOOTSTRAP_TF_DIR" state list >"$current_state"; then
    rm -f "$current_state"
    echo "ERROR: unable to read state before import: $address" >&2
    exit 10
  fi
  if grep -F -x -- "$address" "$current_state" >/dev/null; then
    rm -f "$current_state"
    echo "SKIP_ALREADY_IMPORTED: $address"
    return 0
  fi
  rm -f "$current_state"
  echo "IMPORTING: $address"
  terraform -chdir="$BOOTSTRAP_TF_DIR" import     -input=false -lock-timeout=60s     "${terraform_vars[@]}"     "$address" "$import_id"
  terraform -chdir="$BOOTSTRAP_TF_DIR" state list | grep -F -x -- "$address" >/dev/null || {
    echo "ERROR: imported address is not present in state: $address" >&2
    exit 10
  }
  echo "IMPORTED: $address"
}

import_if_missing "google_service_account.build"   "projects/$CANONICAL_PROJECT/serviceAccounts/khedmah-v1-build@$CANONICAL_PROJECT.iam.gserviceaccount.com"
import_if_missing "google_service_account.migration"   "projects/$CANONICAL_PROJECT/serviceAccounts/khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com"
import_if_missing "google_storage_bucket.cloudbuild_source"   "$CANONICAL_PROJECT/$CANONICAL_PROJECT-cloudbuild-source"
import_if_missing "google_artifact_registry_repository.docker"   "projects/$CANONICAL_PROJECT/locations/$CANONICAL_REGION/repositories/khedmah-digital"
import_if_missing "google_sql_database_instance.postgres"   "projects/$CANONICAL_PROJECT/instances/khedmah-v1-db"
import_if_missing "google_sql_database.application"   "projects/$CANONICAL_PROJECT/instances/khedmah-v1-db/databases/khedmah"
import_if_missing "google_project_iam_custom_role.storage_bucket_policy_viewer"   "projects/$CANONICAL_PROJECT/roles/khedmahStorageBucketPolicyViewer"
import_if_missing "google_iam_workload_identity_pool.github"   "projects/$CANONICAL_PROJECT/locations/global/workloadIdentityPools/khedmah-github"

post_state="$(mktemp)"
terraform -chdir="$BOOTSTRAP_TF_DIR" state list | sort >"$post_state"
if [[ -n "$(comm -3 "$post_state" "$allowed_addresses_file")" ]]; then
  echo "ERROR: Foundation A post-import state does not equal the exact guarded address set." >&2
  comm -3 "$post_state" "$allowed_addresses_file" >&2
  rm -f "$post_state"
  exit 10
fi
rm -f "$post_state"

post_meta="$(mktemp)"
gcloud storage objects describe "$state_uri"   --project="$CANONICAL_PROJECT" --raw --format=json >"$post_meta"
post_generation="$(jq -r '.generation // empty' "$post_meta")"
rm -f "$post_meta"
test "$post_generation" != "$actual_generation" || {
  echo "ERROR: remote state generation did not change after imports." >&2
  exit 10
}

echo "IMPORTED_FOUNDATION_A: 8 resources adopted into Terraform state."
echo "POST_IMPORT_STATE_GENERATION=$post_generation"
echo "NO_APPLY: do not apply infrastructure changes."
echo "NEXT: run the guarded bootstrap PLAN from the same exact main SHA and review every non-noop resource."
