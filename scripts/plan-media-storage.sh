#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
REGION="${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
STATE_BUCKET="${TF_STATE_BUCKET:?TF_STATE_BUCKET is required}"
MEDIA_BUCKET="${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"
RUNTIME_SA="${RUNTIME_SERVICE_ACCOUNT:?RUNTIME_SERVICE_ACCOUNT is required}"
STATE_PREFIX="${TF_STATE_PREFIX:-khedmah/production/media}"

if [[ "$REGION" != "europe-west1" ]]; then
  printf 'ERROR: EXPECTED_REGION=europe-west1 ACTUAL_REGION=%s\n' "$REGION" >&2
  exit 1
fi

if [[ "$STATE_BUCKET" == "$MEDIA_BUCKET" ]]; then
  printf '%s\n' 'ERROR: Terraform state and application media must use different buckets.' >&2
  exit 1
fi

state_json="$(mktemp)"
trap 'rm -f "$state_json"' EXIT

gcloud storage buckets describe "gs://${STATE_BUCKET}" \
  --project="$PROJECT_ID" \
  --format=json > "$state_json"

jq -e '
  .iamConfiguration.uniformBucketLevelAccess.enabled == true and
  .iamConfiguration.publicAccessPrevention == "enforced" and
  .versioning.enabled == true
' "$state_json" >/dev/null

gcloud iam service-accounts describe "$RUNTIME_SA" \
  --project="$PROJECT_ID" \
  --format='value(email)' | grep -F -x -- "$RUNTIME_SA" >/dev/null

terraform -chdir=infra/iac/media init \
  -input=false \
  -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=${STATE_PREFIX}"

terraform -chdir=infra/iac/media validate

if gcloud storage buckets describe "gs://${MEDIA_BUCKET}" \
    --project="$PROJECT_ID" \
    --format='value(name)' >/dev/null 2>&1; then
  if ! terraform -chdir=infra/iac/media state list |
      grep -F -x -- 'google_storage_bucket.media' >/dev/null; then
    printf 'ERROR: EXISTING_MEDIA_BUCKET_REQUIRES_REVIEWED_IMPORT=%s\n' "$MEDIA_BUCKET" >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi
fi

plan_file="${TF_PLAN_FILE:-/tmp/khedmah-media.tfplan}"
terraform -chdir=infra/iac/media plan \
  -input=false \
  -lock-timeout=60s \
  -out="$plan_file" \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="bucket_name=${MEDIA_BUCKET}" \
  -var="runtime_service_account_email=${RUNTIME_SA}"

printf 'READY: MEDIA_TERRAFORM_PLAN=%s\n' "$plan_file"
printf '%s\n' 'NO_TERRAFORM_APPLY'
