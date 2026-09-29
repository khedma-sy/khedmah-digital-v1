#!/usr/bin/env bash
set -euo pipefail

CANONICAL_REPOSITORY="khedma-sy/khedmah-digital-v1"
CANONICAL_PROJECT="khedma-dl"
CANONICAL_PROJECT_NUMBER="311026134906"
CANONICAL_REGION="europe-west1"
CANONICAL_STATE_BUCKET="khedma-dl-khedmah-tfstate"
CANONICAL_STATE_PREFIX="khedmah/production/bootstrap"
CANONICAL_STATE_LINEAGE="6025674e-1a29-7134-7794-5f106421f6fd"
CANONICAL_INITIAL_GENERATION="1790067677438796"
MODE="${ADOPTION_MODE:-VERIFY}"
CONFIRMATION="${ADOPTION_CONFIRMATION:-}"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

for cmd in git gcloud terraform jq sha256sum; do
  command -v "$cmd" >/dev/null || die "$cmd is required"
done

TERRAFORM_BIN="$(command -v terraform)"
test "$TERRAFORM_BIN" != "/google/bin/terraform" || die "refusing Cloud Shell /google/bin/terraform shim; put a real Terraform binary first in PATH"
terraform_version_json="$(terraform version -json 2>/dev/null)" || die "terraform version -json failed"
TERRAFORM_VERSION="$(
  printf '%s' "$terraform_version_json" |
    jq -er '.terraform_version | select(type == "string" and length > 0)' 2>/dev/null
)" || die "terraform version -json did not return a valid terraform_version"
tf_major="${TERRAFORM_VERSION%%.*}"
tf_minor_patch="${TERRAFORM_VERSION#*.}"
tf_minor="${tf_minor_patch%%.*}"
[[ "$tf_major" =~ ^[0-9]+$ && "$tf_minor" =~ ^[0-9]+$ ]] || die "unable to parse Terraform version: $TERRAFORM_VERSION"
(( tf_major > 1 || (tf_major == 1 && tf_minor >= 8) )) || die "Terraform >= 1.8.0 is required"

case "$MODE" in
  VERIFY|IMPORT_BATCH_A) ;;
  *) die "ADOPTION_MODE must be VERIFY or IMPORT_BATCH_A" ;;
esac

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
test -z "$(git status --porcelain)" || die "working tree must be clean"
origin="$(git remote get-url origin)"
case "$origin" in
  "https://github.com/$CANONICAL_REPOSITORY.git"|"git@github.com:$CANONICAL_REPOSITORY.git") ;;
  *) die "origin must be the canonical GitHub repository" ;;
esac

git fetch origin main --quiet
CURRENT_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
test "$CURRENT_SHA" = "$MAIN_SHA" || die "HEAD must equal origin/main"
[[ "$CURRENT_SHA" =~ ^[0-9a-f]{40}$ ]] || die "invalid main SHA"
SHA7="${CURRENT_SHA:0:7}"

project="$(gcloud config get-value project 2>/dev/null)"
test "$project" = "$CANONICAL_PROJECT" || die "active gcloud project must be $CANONICAL_PROJECT"
project_number="$(gcloud projects describe "$CANONICAL_PROJECT" --format='value(projectNumber)')"
test "$project_number" = "$CANONICAL_PROJECT_NUMBER" || die "unexpected Google Cloud project number"

state_uri="gs://$CANONICAL_STATE_BUCKET/$CANONICAL_STATE_PREFIX/default.tfstate"
bucket_meta="$(mktemp)"
state_meta="$(mktemp)"
state_json="$(mktemp)"
TF_DATA_DIR=""

cleanup() {
  rm -f "$bucket_meta" "$state_meta" "$state_json"
  if [[ -n "$TF_DATA_DIR" && -d "$TF_DATA_DIR" ]]; then
    rm -rf "$TF_DATA_DIR"
  fi
}
trap cleanup EXIT

gcloud storage buckets describe "gs://$CANONICAL_STATE_BUCKET" \
  --project="$CANONICAL_PROJECT" \
  --raw \
  --format=json >"$bucket_meta"
bucket_project_number="$(jq -r '.projectNumber // .project_number // empty' "$bucket_meta")"
test "$bucket_project_number" = "$CANONICAL_PROJECT_NUMBER" || die "Terraform state bucket belongs to an unexpected Google Cloud project"

gcloud storage objects describe "$state_uri" --project="$CANONICAL_PROJECT" --raw --format=json >"$state_meta"
gcloud storage cat "$state_uri" >"$state_json"

generation="$(jq -r '.generation // empty' "$state_meta")"
lineage="$(jq -r '.lineage // empty' "$state_json")"
serial="$(jq -r '.serial // empty' "$state_json")"
test "$lineage" = "$CANONICAL_STATE_LINEAGE" || die "unexpected bootstrap state lineage"
[[ "$serial" =~ ^[0-9]+$ ]] || die "bootstrap state serial is not numeric"

if [[ "$serial" = "1" ]]; then
  test "$generation" = "$CANONICAL_INITIAL_GENERATION" || die "initial bootstrap state generation changed unexpectedly"
fi

batch_a_addresses='[
  "google_service_account.build",
  "google_service_account.migration",
  "google_storage_bucket.cloudbuild_source",
  "google_artifact_registry_repository.docker",
  "google_sql_database_instance.postgres",
  "google_sql_database.application",
  "google_project_iam_custom_role.storage_bucket_policy_viewer",
  "google_iam_workload_identity_pool.github"
]'

reviewed_batch_a_ids='{
  "google_service_account.build": "projects/khedma-dl/serviceAccounts/khedmah-v1-build@khedma-dl.iam.gserviceaccount.com",
  "google_service_account.migration": "projects/khedma-dl/serviceAccounts/khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com",
  "google_storage_bucket.cloudbuild_source": "khedma-dl-cloudbuild-source",
  "google_artifact_registry_repository.docker": "projects/khedma-dl/locations/europe-west1/repositories/khedmah-digital",
  "google_sql_database_instance.postgres": "khedmah-v1-db",
  "google_sql_database.application": "projects/khedma-dl/instances/khedmah-v1-db/databases/khedmah",
  "google_project_iam_custom_role.storage_bucket_policy_viewer": "projects/khedma-dl/roles/khedmahStorageBucketPolicyViewer",
  "google_iam_workload_identity_pool.github": "projects/311026134906/locations/global/workloadIdentityPools/khedmah-github"
}'

reviewed_pre_adopted_secret_ids='{
  "google_secret_manager_secret.runtime[\"DATABASE_URL\"]": "projects/khedma-dl/secrets/DATABASE_URL",
  "google_secret_manager_secret.runtime[\"FIREBASE_API_KEY\"]": "projects/khedma-dl/secrets/FIREBASE_API_KEY",
  "google_secret_manager_secret.runtime[\"FIREBASE_APP_ID\"]": "projects/khedma-dl/secrets/FIREBASE_APP_ID",
  "google_secret_manager_secret.runtime[\"GOOGLE_MAPS_BROWSER_API_KEY\"]": "projects/khedma-dl/secrets/GOOGLE_MAPS_BROWSER_API_KEY",
  "google_secret_manager_secret.runtime[\"GOOGLE_MAPS_SERVER_API_KEY\"]": "projects/khedma-dl/secrets/GOOGLE_MAPS_SERVER_API_KEY",
  "google_secret_manager_secret.runtime[\"GOOGLE_OAUTH_SERVER_CLIENT_ID\"]": "projects/khedma-dl/secrets/GOOGLE_OAUTH_SERVER_CLIENT_ID",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_API_KEY\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_API_KEY",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_APP_ID\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_APP_ID",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_PROJECT_ID\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "google_secret_manager_secret.runtime[\"NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET\"]": "projects/khedma-dl/secrets/NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "google_secret_manager_secret.runtime[\"OPERATIONS_PRODUCT_ROLE_BINDINGS\"]": "projects/khedma-dl/secrets/OPERATIONS_PRODUCT_ROLE_BINDINGS",
  "google_secret_manager_secret.runtime[\"RESEND_API_KEY\"]": "projects/khedma-dl/secrets/RESEND_API_KEY",
  "google_secret_manager_secret.database_migration": "projects/khedma-dl/secrets/DATABASE_MIGRATION_URL",
  "google_secret_manager_secret.maps_android": "projects/khedma-dl/secrets/GOOGLE_MAPS_ANDROID_API_KEY",
  "google_secret_manager_secret.bootstrap_admin": "projects/khedma-dl/secrets/BOOTSTRAP_ADMIN_SECRET"
}'

allowed_addresses="$(
  jq -cn \
    --argjson batch "$batch_a_addresses" \
    --argjson reviewed_secrets "$reviewed_pre_adopted_secret_ids" \
    '$batch + ($reviewed_secrets | keys)'
)"

jq -e \
  --argjson allowed "$allowed_addresses" \
  --argjson reviewed_batch "$reviewed_batch_a_ids" \
  --argjson reviewed_secrets "$reviewed_pre_adopted_secret_ids" '
  (all(
    .resources[]?;
    (.mode // "managed") == "managed" and ((.module // "") == "")
  )) as $root_managed_only
  | [ .resources[]? as $r
    | ($r.instances // [])[] as $i
    | {
        address: (
          if ($i.index_key? != null)
          then ($r.type + "." + $r.name + "[" + ($i.index_key|tojson) + "]")
          else ($r.type + "." + $r.name)
          end
        ),
        id: ($i.attributes.id // "")
      }
  ] as $instances
  | $root_managed_only
    and all($instances[]?; . as $x | $allowed | index($x.address) != null)
    and all(
      $instances[]? | select((.address | startswith("google_secret_manager_secret.")) | not);
      . as $x | ($reviewed_batch[$x.address] // null) == $x.id
    )
    and all(
      $instances[]? | select(.address | startswith("google_secret_manager_secret."));
      . as $x | ($reviewed_secrets[$x.address] // null) == $x.id
    )
' "$state_json" >/dev/null || die "bootstrap state contains an unreviewed address, non-root resource, or unexpected resource identity"

printf 'LOCKED_MAIN_SHA=%s\n' "$CURRENT_SHA"
printf 'TERRAFORM_BIN=%s\n' "$TERRAFORM_BIN"
printf 'TERRAFORM_VERSION=%s\n' "$TERRAFORM_VERSION"
printf 'STATE_BUCKET_PROJECT_NUMBER=%s\n' "$bucket_project_number"
printf 'STATE_URI=%s\n' "$state_uri"
printf 'STATE_LINEAGE=%s\n' "$lineage"
printf 'STATE_SERIAL=%s\n' "$serial"
printf 'STATE_GENERATION=%s\n' "$generation"

if [[ "$MODE" = "VERIFY" ]]; then
  printf 'VERIFY_OK: guarded Batch A adoption preflight passed; no state mutation performed.\n'
  exit 0
fi

expected_confirmation="IMPORT_KHEDMAH_BOOTSTRAP_BATCH_A_${SHA7^^}"
test "$CONFIRMATION" = "$expected_confirmation" || die "confirmation must equal $expected_confirmation"

snapshot="$HOME/khedmah-bootstrap-state-preimport-${CURRENT_SHA}-serial${serial}-gen${generation}.tfstate"
cp "$state_json" "$snapshot"
chmod 600 "$snapshot"
snapshot_sha="$(sha256sum "$snapshot" | awk '{print $1}')"
printf 'SNAPSHOT=%s\n' "$snapshot"
printf 'SNAPSHOT_SHA256=%s\n' "$snapshot_sha"

BOOTSTRAP_TF_DIR="$ROOT/infra/iac/bootstrap"
CONFIGURATION_SHA256="$(
  tmp="$(mktemp)"
  for file in main.tf variables.tf outputs.tf versions.tf .terraform.lock.hcl; do
    (
      cd "$BOOTSTRAP_TF_DIR"
      sha256sum "$file"
    ) >>"$tmp"
  done
  sha256sum "$tmp" | awk '{print $1}'
  rm -f "$tmp"
)"
[[ "$CONFIGURATION_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "invalid bootstrap configuration fingerprint"

TF_DATA_DIR="$(mktemp -d)"
export TF_DATA_DIR
terraform -chdir="$BOOTSTRAP_TF_DIR" init \
  -input=false \
  -lockfile=readonly \
  -reconfigure \
  -backend-config="bucket=$CANONICAL_STATE_BUCKET" \
  -backend-config="prefix=$CANONICAL_STATE_PREFIX" >/dev/null

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
  "-var=github_repository_id=1307435925"
  "-var=github_repository_owner_id=307214577"
  "-var=github_environment=production"
  "-var=github_ref=refs/heads/main"
)

declare -a addresses=(
  "google_service_account.build"
  "google_service_account.migration"
  "google_storage_bucket.cloudbuild_source"
  "google_artifact_registry_repository.docker"
  "google_sql_database_instance.postgres"
  "google_sql_database.application"
  "google_project_iam_custom_role.storage_bucket_policy_viewer"
  "google_iam_workload_identity_pool.github"
)
declare -a import_ids=(
  "projects/khedma-dl/serviceAccounts/khedmah-v1-build@khedma-dl.iam.gserviceaccount.com"
  "projects/khedma-dl/serviceAccounts/khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com"
  "khedma-dl/khedma-dl-cloudbuild-source"
  "projects/khedma-dl/locations/europe-west1/repositories/khedmah-digital"
  "projects/khedma-dl/instances/khedmah-v1-db"
  "projects/khedma-dl/instances/khedmah-v1-db/databases/khedmah"
  "projects/khedma-dl/roles/khedmahStorageBucketPolicyViewer"
  "projects/khedma-dl/locations/global/workloadIdentityPools/khedmah-github"
)
# google_sql_database_instance normalizes its imported state id to the instance name on the pinned provider.
declare -a expected_state_ids=(
  "projects/khedma-dl/serviceAccounts/khedmah-v1-build@khedma-dl.iam.gserviceaccount.com"
  "projects/khedma-dl/serviceAccounts/khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com"
  "khedma-dl-cloudbuild-source"
  "projects/khedma-dl/locations/europe-west1/repositories/khedmah-digital"
  "khedmah-v1-db"
  "projects/khedma-dl/instances/khedmah-v1-db/databases/khedmah"
  "projects/khedma-dl/roles/khedmahStorageBucketPolicyViewer"
  "projects/$CANONICAL_PROJECT_NUMBER/locations/global/workloadIdentityPools/khedmah-github"
)

state_id_for() {
  local address="$1"
  terraform -chdir="$BOOTSTRAP_TF_DIR" show -json 2>/dev/null |
    jq -r --arg address "$address" '
      .values.root_module.resources[]?
      | select(.address == $address)
      | .values.id // empty
    ' | head -1
}

for i in "${!addresses[@]}"; do
  address="${addresses[$i]}"
  import_id="${import_ids[$i]}"
  expected_state_id="${expected_state_ids[$i]}"
  existing_id="$(state_id_for "$address" || true)"

  if [[ -n "$existing_id" ]]; then
    test "$existing_id" = "$expected_state_id" || die "$address exists in state with unexpected id: $existing_id"
    printf 'SKIP_ALREADY_IMPORTED: %s = %s\n' "$address" "$existing_id"
    continue
  fi

  printf 'IMPORTING: %s <= %s\n' "$address" "$import_id"
  terraform -chdir="$BOOTSTRAP_TF_DIR" import -input=false -lock=true -lock-timeout=60s     "${terraform_vars[@]}" "$address" "$import_id"

  actual_id="$(state_id_for "$address")"
  test "$actual_id" = "$expected_state_id" || die "$address imported with unexpected state id: $actual_id"
  printf 'IMPORTED_OK: %s = %s\n' "$address" "$actual_id"
done

printf '%s\n' '--- BATCH A STATE ADDRESSES ---'
terraform -chdir="$BOOTSTRAP_TF_DIR" state list | sort
printf 'IMPORT_BATCH_A_OK: state adoption completed for guarded Batch A only.\n'
printf 'NO_APPLY: do not run terraform apply; run a reviewed PLAN next.\n'
