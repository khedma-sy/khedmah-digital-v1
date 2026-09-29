#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-europe-west1}"

CANONICAL_PROJECT="khedma-dl"
CANONICAL_REGION="europe-west1"
CANONICAL_REPOSITORY="khedma-sy/khedmah-digital-v1"
CANONICAL_REPOSITORY_ID="1307435925"
CANONICAL_OWNER_ID="307214577"
CANONICAL_ENVIRONMENT="production"
TF_STATE_BUCKET="${TF_STATE_BUCKET:-khedma-dl-khedmah-tfstate}"
SCRATCH_CONFIRMATION="${SCRATCH_CONFIRMATION:-}"

test "$GOOGLE_CLOUD_PROJECT" = "$CANONICAL_PROJECT" || {
  echo "ERROR: scratch adoption plan is pinned to $CANONICAL_PROJECT." >&2
  exit 2
}
test "$GOOGLE_CLOUD_REGION" = "$CANONICAL_REGION" || {
  echo "ERROR: scratch adoption plan is pinned to $CANONICAL_REGION." >&2
  exit 2
}

for cmd in gcloud terraform git jq python3 sha256sum tar awk grep; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $cmd" >&2
    exit 3
  }
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
test -z "$(git status --porcelain)" || {
  echo "ERROR: scratch adoption plan requires a clean checkout." >&2
  exit 4
}

origin="$(git remote get-url origin)"
case "$origin" in
  "https://github.com/$CANONICAL_REPOSITORY"|"https://github.com/$CANONICAL_REPOSITORY.git"|"git@github.com:$CANONICAL_REPOSITORY.git"|"ssh://git@github.com/$CANONICAL_REPOSITORY.git") ;;
  *)
    echo "ERROR: origin is not the canonical repository." >&2
    exit 4
    ;;
esac

git fetch origin main --quiet
CURRENT_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
test "$CURRENT_SHA" = "$MAIN_SHA" || {
  echo "ERROR: scratch adoption plan requires exact latest origin/main." >&2
  exit 4
}
[[ "$CURRENT_SHA" =~ ^[0-9a-f]{40}$ ]]
SHA7="${CURRENT_SHA:0:7}"
EXPECTED_CONFIRMATION="SCRATCH_BOOTSTRAP_ADOPTION_${SHA7^^}"
test "$SCRATCH_CONFIRMATION" = "$EXPECTED_CONFIRMATION" || {
  echo "ERROR: set SCRATCH_CONFIRMATION=$EXPECTED_CONFIRMATION" >&2
  exit 4
}

terraform_version="$(terraform version -json | jq -r '.terraform_version // empty')"
[[ "$terraform_version" =~ ^([0-9]+)\.([0-9]+)(\.[0-9]+)?([+-].*)?$ ]] || {
  echo "ERROR: unable to determine Terraform version." >&2
  exit 3
}
if (( BASH_REMATCH[1] < 1 || (BASH_REMATCH[1] == 1 && BASH_REMATCH[2] < 8) )); then
  echo "ERROR: Terraform 1.8.0 or newer is required." >&2
  exit 3
fi

project_number="$(gcloud projects describe "$CANONICAL_PROJECT" --format='value(projectNumber)')"
test "$project_number" = "311026134906" || {
  echo "ERROR: unexpected Google Cloud project number." >&2
  exit 5
}

scratch_root="$(mktemp -d "$HOME/khedmah-bootstrap-adoption-scratch.XXXXXX")"
cleanup() {
  rm -rf "$scratch_root"
}
trap cleanup EXIT

git archive --format=tar "$CURRENT_SHA" infra/iac/bootstrap | tar -xf - -C "$scratch_root"
SCRATCH_TF_DIR="$scratch_root/infra/iac/bootstrap"
test -f "$SCRATCH_TF_DIR/versions.tf"
test -f "$SCRATCH_TF_DIR/main.tf"

# The scratch configuration is intentionally detached from all remote state.
# Only the temporary copy is rewritten; the repository remains untouched.
python3 - "$SCRATCH_TF_DIR/versions.tf" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
needle = 'backend "gcs" {}'
replacement = 'backend "local" { path = "scratch.tfstate" }'
if needle not in text:
    raise SystemExit("canonical GCS backend declaration not found")
text = text.replace(needle, replacement, 1)
if 'backend "gcs"' in text:
    raise SystemExit("remote GCS backend still present in scratch configuration")
path.write_text(text)
PY

configuration_digest_input="$scratch_root/config-digest.txt"
for file in main.tf variables.tf outputs.tf versions.tf .terraform.lock.hcl; do
  # Fingerprint the canonical source, not the scratch backend rewrite.
  git show "$CURRENT_SHA:infra/iac/bootstrap/$file" | sha256sum >>"$configuration_digest_input"
done
CONFIGURATION_SHA256="$(sha256sum "$configuration_digest_input" | awk '{print $1}')"
[[ "$CONFIGURATION_SHA256" =~ ^[0-9a-f]{64}$ ]]

terraform_vars=(
  "-var=project_id=$CANONICAL_PROJECT"
  "-var=region=$CANONICAL_REGION"
  "-var=source_commit_sha=$CURRENT_SHA"
  "-var=configuration_sha256=$CONFIGURATION_SHA256"
  "-var=terraform_state_bucket_name=$TF_STATE_BUCKET"
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

export TF_DATA_DIR="$scratch_root/.terraform-data"
terraform -chdir="$SCRATCH_TF_DIR" init -input=false -lockfile=readonly >/dev/null

import_resource() {
  local address="$1"
  local import_id="$2"
  local label="$3"
  if terraform -chdir="$SCRATCH_TF_DIR" import -input=false "${terraform_vars[@]}" "$address" "$import_id" >/dev/null 2>"$scratch_root/import.err"; then
    printf 'SCRATCH_IMPORTED: %s\n' "$label"
  else
    printf 'ERROR: scratch import failed: %s\n' "$label" >&2
    sed -n '1,20p' "$scratch_root/import.err" >&2
    exit 6
  fi
}

extract_toset_strings() {
  local name="$1"
  python3 - "$SCRATCH_TF_DIR/main.tf" "$name" <<'PY'
from pathlib import Path
import re, sys
text = Path(sys.argv[1]).read_text()
name = re.escape(sys.argv[2])
match = re.search(rf'\b{name}\s*=\s*toset\(\[(.*?)\]\)', text, re.S)
if not match:
    raise SystemExit(2)
for value in re.findall(r'"([^"]+)"', match.group(1)):
    print(value)
PY
}

enabled_services_file="$scratch_root/enabled-services.txt"
gcloud services list --enabled --project="$CANONICAL_PROJECT" --format='value(config.name)' | sort -u >"$enabled_services_file"
while IFS= read -r service; do
  if grep -F -x -- "$service" "$enabled_services_file" >/dev/null; then
    import_resource "google_project_service.bootstrap[\"$service\"]" "$CANONICAL_PROJECT/$service" "api:$service"
  else
    printf 'SCRATCH_LIVE_ABSENT: api:%s\n' "$service"
  fi
done < <(extract_toset_strings google_apis)

# Existing structural resources that match the canonical resource identities.
gcloud storage buckets describe "gs://$CANONICAL_PROJECT-cloudbuild-source" --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
import_resource "google_storage_bucket.cloudbuild_source" "$CANONICAL_PROJECT/$CANONICAL_PROJECT-cloudbuild-source" "cloudbuild-source-bucket"

gcloud sql instances describe khedmah-v1-db --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
import_resource "google_sql_database_instance.postgres" "projects/$CANONICAL_PROJECT/instances/khedmah-v1-db" "cloud-sql-instance"

gcloud sql databases list --instance=khedmah-v1-db --project="$CANONICAL_PROJECT" --filter='name=khedmah' --format='value(name)' | grep -F -x khedmah >/dev/null
import_resource "google_sql_database.application" "projects/$CANONICAL_PROJECT/instances/khedmah-v1-db/databases/khedmah" "cloud-sql-database"

gcloud artifacts repositories describe khedmah-digital --location="$CANONICAL_REGION" --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
import_resource "google_artifact_registry_repository.docker" "projects/$CANONICAL_PROJECT/locations/$CANONICAL_REGION/repositories/khedmah-digital" "artifact-registry"

for sa in build migration; do
  case "$sa" in
    build) email="khedmah-v1-build@$CANONICAL_PROJECT.iam.gserviceaccount.com"; address="google_service_account.build" ;;
    migration) email="khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com"; address="google_service_account.migration" ;;
  esac
  gcloud iam service-accounts describe "$email" --project="$CANONICAL_PROJECT" --format='value(email)' >/dev/null
  import_resource "$address" "projects/$CANONICAL_PROJECT/serviceAccounts/$email" "service-account:$sa"
done

# The canonical runtime/deployer identities do not exist live yet.
# Never import the legacy khedma-v1-runtime or khedma-v1-deployer into these addresses.
printf 'SCRATCH_LIVE_ABSENT: service-account:runtime-canonical\n'
printf 'SCRATCH_LIVE_ABSENT: service-account:deployer-canonical\n'

if gcloud iam roles describe khedmahStorageBucketPolicyViewer --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null 2>&1; then
  import_resource "google_project_iam_custom_role.storage_bucket_policy_viewer" "projects/$CANONICAL_PROJECT/roles/khedmahStorageBucketPolicyViewer" "custom-role:storage-bucket-policy-viewer"
fi

runtime_secrets=(
  DATABASE_URL FIREBASE_API_KEY FIREBASE_APP_ID GOOGLE_MAPS_BROWSER_API_KEY
  GOOGLE_MAPS_SERVER_API_KEY GOOGLE_OAUTH_SERVER_CLIENT_ID
  NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET OPERATIONS_PRODUCT_ROLE_BINDINGS RESEND_API_KEY
)
for secret in "${runtime_secrets[@]}"; do
  gcloud secrets describe "$secret" --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
  import_resource "google_secret_manager_secret.runtime[\"$secret\"]" "projects/$CANONICAL_PROJECT/secrets/$secret" "secret:$secret"
done

for spec in   "google_secret_manager_secret.database_migration|DATABASE_MIGRATION_URL"   "google_secret_manager_secret.maps_android|GOOGLE_MAPS_ANDROID_API_KEY"   "google_secret_manager_secret.bootstrap_admin|BOOTSTRAP_ADMIN_SECRET"
do
  address="${spec%%|*}"
  secret="${spec#*|}"
  gcloud secrets describe "$secret" --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
  import_resource "$address" "projects/$CANONICAL_PROJECT/secrets/$secret" "secret:$secret"
done

gcloud iam workload-identity-pools describe khedmah-github --location=global --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
import_resource "google_iam_workload_identity_pool.github" "projects/$CANONICAL_PROJECT/locations/global/workloadIdentityPools/khedmah-github" "wif-pool"

gcloud iam workload-identity-pools providers describe github-actions --workload-identity-pool=khedmah-github --location=global --project="$CANONICAL_PROJECT" --format='value(name)' >/dev/null
import_resource "google_iam_workload_identity_pool_provider.github" "projects/$CANONICAL_PROJECT/locations/global/workloadIdentityPools/khedmah-github/providers/github-actions" "wif-provider"

project_policy="$scratch_root/project-policy.json"
gcloud projects get-iam-policy "$CANONICAL_PROJECT" --format=json >"$project_policy"
iam_member_exists() {
  local role="$1" member="$2"
  jq -e --arg role "$role" --arg member "$member" '
    any(.bindings[]?; .role == $role and any(.members[]?; . == $member))
  ' "$project_policy" >/dev/null
}

build_member="serviceAccount:khedmah-v1-build@$CANONICAL_PROJECT.iam.gserviceaccount.com"
migration_member="serviceAccount:khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com"

while IFS= read -r role; do
  if iam_member_exists "$role" "$build_member"; then
    import_resource "google_project_iam_member.build[\"$role\"]" "$CANONICAL_PROJECT $role $build_member" "project-iam:build:$role"
  else
    printf 'SCRATCH_LIVE_ABSENT: project-iam:build:%s\n' "$role"
  fi
done < <(extract_toset_strings build_roles)

if iam_member_exists "roles/cloudsql.client" "$migration_member"; then
  import_resource "google_project_iam_member.migration_cloud_sql_client" "$CANONICAL_PROJECT roles/cloudsql.client $migration_member" "project-iam:migration-cloudsql-client"
fi

bucket_policy="$scratch_root/cloudbuild-bucket-policy.json"
gcloud storage buckets get-iam-policy "gs://$CANONICAL_PROJECT-cloudbuild-source" --project="$CANONICAL_PROJECT" --format=json >"$bucket_policy"
if jq -e --arg member "$build_member" '
  any(.bindings[]?; .role == "roles/storage.objectViewer" and any(.members[]?; . == $member))
' "$bucket_policy" >/dev/null; then
  import_resource "google_storage_bucket_iam_member.build_cloudbuild_source_reader" "b/$CANONICAL_PROJECT-cloudbuild-source roles/storage.objectViewer $build_member" "bucket-iam:build-cloudbuild-source-reader"
fi

for secret in $(extract_toset_strings build_secret_names); do
  policy="$scratch_root/secret-$secret-policy.json"
  gcloud secrets get-iam-policy "$secret" --project="$CANONICAL_PROJECT" --format=json >"$policy"
  if jq -e --arg member "$build_member" '
    any(.bindings[]?; .role == "roles/secretmanager.secretAccessor" and any(.members[]?; . == $member))
  ' "$policy" >/dev/null; then
    import_resource "google_secret_manager_secret_iam_member.build[\"$secret\"]" "projects/$CANONICAL_PROJECT/secrets/$secret roles/secretmanager.secretAccessor $build_member" "secret-iam:build:$secret"
  else
    printf 'SCRATCH_LIVE_ABSENT: secret-iam:build:%s\n' "$secret"
  fi
done

migration_secret_policy="$scratch_root/database-migration-policy.json"
gcloud secrets get-iam-policy DATABASE_MIGRATION_URL --project="$CANONICAL_PROJECT" --format=json >"$migration_secret_policy"
if jq -e --arg member "$migration_member" '
  any(.bindings[]?; .role == "roles/secretmanager.secretAccessor" and any(.members[]?; . == $member))
' "$migration_secret_policy" >/dev/null; then
  import_resource "google_secret_manager_secret_iam_member.database_migration_accessor" "projects/$CANONICAL_PROJECT/secrets/DATABASE_MIGRATION_URL roles/secretmanager.secretAccessor $migration_member" "secret-iam:migration-accessor"
fi

state_list="$scratch_root/scratch-state-list.txt"
terraform -chdir="$SCRATCH_TF_DIR" state list | sort >"$state_list"

plan_file="$scratch_root/scratch-adoption.tfplan"
plan_json="$scratch_root/scratch-adoption-plan.json"
terraform -chdir="$SCRATCH_TF_DIR" plan -input=false -refresh=true -out="$plan_file" "${terraform_vars[@]}" >/dev/null
terraform -chdir="$SCRATCH_TF_DIR" show -json "$plan_file" >"$plan_json"

if jq -e '
  any(.resource_changes[]?; (.change.actions | index("delete")) != null)
' "$plan_json" >/dev/null; then
  echo "ERROR: scratch adoption plan contains delete/replacement actions." >&2
  jq -r '.resource_changes[]? | select((.change.actions | index("delete")) != null) | "\(.change.actions|join(","))  \(.address)"' "$plan_json" >&2
  exit 7
fi

summary="$HOME/khedmah-bootstrap-adoption-scratch-${CURRENT_SHA}.txt"
{
  printf 'SOURCE_SHA=%s\n' "$CURRENT_SHA"
  printf 'MODE=LOCAL_SCRATCH_STATE_ONLY\n'
  printf 'REMOTE_STATE_MUTATED=false\n'
  printf 'CLOUD_MUTATIONS=false\n'
  printf 'SCRATCH_STATE_RESOURCE_COUNT=%s\n' "$(wc -l <"$state_list" | tr -d ' ')"
  printf '%s\n' '--- SCRATCH STATE ADDRESSES ---'
  cat "$state_list"
  printf '%s\n' '--- REMAINING PLAN ACTIONS ---'
  jq -r '.resource_changes[]? | select(.change.actions != ["no-op"]) | "\(.change.actions|join(","))  \(.address)"' "$plan_json"
} >"$summary"

echo "READY: SCRATCH_ADOPTION_SUMMARY=$summary"
echo "READY: SOURCE_SHA=$CURRENT_SHA"
echo "NO_REMOTE_STATE_MUTATION"
echo "NO_CLOUD_MUTATION"
echo "NO_APPLY"
