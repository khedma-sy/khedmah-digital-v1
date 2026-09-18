#!/usr/bin/env bash
set -euo pipefail
set +x

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-me-central1}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-khedma-sy/khedmah-digital-v1}"
TF_STATE_BUCKET="${TF_STATE_BUCKET:-${GOOGLE_CLOUD_PROJECT}-khedmah-tfstate}"
TF_STATE_PREFIX="${TF_STATE_PREFIX:-khedmah/production/bootstrap}"
BOOTSTRAP_APPLY="${BOOTSTRAP_APPLY:-false}"

legacy_project="project-""94512a0e-1a5e-4bdb-87f"
legacy_number="774201""339973"
[[ "$GOOGLE_CLOUD_PROJECT" != *"$legacy_project"* && "$GOOGLE_CLOUD_PROJECT" != *"$legacy_number"* ]] || {
  echo 'ERROR: refusing to bootstrap the legacy Google project.' >&2
  exit 2
}

for command_name in gcloud terraform git jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command_name" >&2
    exit 3
  }
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

[[ -z "$(git status --porcelain)" ]] || {
  echo 'ERROR: bootstrap requires a clean repository checkout.' >&2
  exit 4
}

gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectId)' >/dev/null
gcloud config set project "$GOOGLE_CLOUD_PROJECT" >/dev/null

billing_enabled="$(gcloud billing projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
[[ "$billing_enabled" == "True" || "$billing_enabled" == "true" ]] || {
  echo 'ERROR: billing must be linked and enabled on the new production project before bootstrap.' >&2
  exit 5
}

gcloud services enable serviceusage.googleapis.com storage.googleapis.com   --project "$GOOGLE_CLOUD_PROJECT" --quiet

if ! gcloud storage buckets describe "gs://$TF_STATE_BUCKET"   --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)' >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$TF_STATE_BUCKET"     --project "$GOOGLE_CLOUD_PROJECT"     --location "$GOOGLE_CLOUD_REGION"     --uniform-bucket-level-access     --public-access-prevention     --quiet
fi

gcloud storage buckets update "gs://$TF_STATE_BUCKET"   --project "$GOOGLE_CLOUD_PROJECT"   --uniform-bucket-level-access   --public-access-prevention   --versioning   --quiet

plan_file="$(mktemp -t khedmah-production-bootstrap.XXXXXX.tfplan)"
trap 'rm -f "$plan_file"' EXIT

terraform -chdir=infra/iac/bootstrap init   -input=false   -reconfigure   -backend-config="bucket=$TF_STATE_BUCKET"   -backend-config="prefix=$TF_STATE_PREFIX"

terraform -chdir=infra/iac/bootstrap validate

terraform -chdir=infra/iac/bootstrap plan \
  -input=false \
  -lock-timeout=60s \
  -out="$plan_file" \
  -var="project_id=$GOOGLE_CLOUD_PROJECT" \
  -var="region=$GOOGLE_CLOUD_REGION" \
  -var="github_repository=$GITHUB_REPOSITORY" \
  -var='github_workflow_path=.github/workflows/production-operator-new-account.yml' \
  -var='github_additional_workflow_paths=[".github/workflows/production-operator.yml",".github/workflows/production-baseline-001-020.yml",".github/workflows/production-bootstrap-admin.yml",".github/workflows/production-migrations-025-034.yml",".github/workflows/terraform-media-apply.yml",".github/workflows/terraform-media-plan.yml",".github/workflows/terraform-media-state-handoff.yml",".github/workflows/terraform-client-maps-plan.yml",".github/workflows/terraform-client-maps-apply.yml",".github/workflows/android-release-certification.yml"]' \
  -var='github_ref=refs/heads/main'

echo "READY: BOOTSTRAP_PLAN=$plan_file"
echo "READY: TF_STATE_BUCKET=$TF_STATE_BUCKET"
echo "READY: TF_STATE_PREFIX=$TF_STATE_PREFIX"

if [[ "$BOOTSTRAP_APPLY" != "true" ]]; then
  echo 'NO_APPLY: review the Terraform plan; rerun with BOOTSTRAP_APPLY=true only after approval.'
  exit 0
fi

terraform -chdir=infra/iac/bootstrap apply   -input=false   -lock-timeout=60s   "$plan_file"

outputs_json="$(terraform -chdir=infra/iac/bootstrap output -json)"
printf '%s
' "$outputs_json" | jq '{
  artifact_registry_repository_id: .artifact_registry_repository_id.value,
  cloudbuild_source_bucket: .cloudbuild_source_bucket.value,
  cloud_sql_instance_connection_name: .cloud_sql_instance_connection_name.value,
  cloud_sql_database_name: .cloud_sql_database_name.value,
  runtime_service_account_email: .runtime_service_account_email.value,
  deployer_service_account_email: .deployer_service_account_email.value,
  build_service_account_email: .build_service_account_email.value,
  workload_identity_provider: .workload_identity_provider.value,
  bootstrap_admin_secret_id: .bootstrap_admin_secret_id.value,
  secret_ids: .secret_ids.value
}'

echo 'APPLIED: bootstrap infrastructure exists in the new Google project.'
echo 'NEXT: add secret VALUES as enabled Secret Manager versions; Terraform intentionally creates names only.'
echo 'NEXT: set OPERATIONS_BUILD_SERVICE_ACCOUNT from build_service_account_email and configure the remaining GitHub production environment variables/secrets from the outputs above.'
