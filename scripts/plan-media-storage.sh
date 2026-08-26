#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
REGION="${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
STATE_BUCKET="${TF_STATE_BUCKET:?TF_STATE_BUCKET is required}"
MEDIA_BUCKET="${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"
RUNTIME_SA="${RUNTIME_SERVICE_ACCOUNT:?RUNTIME_SERVICE_ACCOUNT is required}"
LEGACY_ROOT_STATE_LIST_FILE="${LEGACY_ROOT_STATE_LIST_FILE:?LEGACY_ROOT_STATE_LIST_FILE is required}"
EXPECTED_STATE_PREFIX="khedmah/production/media"
STATE_PREFIX="${TF_STATE_PREFIX:-$EXPECTED_STATE_PREFIX}"

if [[ "$REGION" != "europe-west1" ]]; then
  printf 'ERROR: EXPECTED_REGION=europe-west1 ACTUAL_REGION=%s\n' "$REGION" >&2
  exit 1
fi

if [[ "$STATE_BUCKET" == "$MEDIA_BUCKET" ]]; then
  printf '%s\n' 'ERROR: Terraform state and application media must use different buckets.' >&2
  exit 1
fi

if [[ "$STATE_PREFIX" != "$EXPECTED_STATE_PREFIX" ]]; then
  printf 'ERROR: UNEXPECTED_TERRAFORM_STATE_PREFIX EXPECTED=%s ACTUAL=%s\n' \
    "$EXPECTED_STATE_PREFIX" "$STATE_PREFIX" >&2
  exit 1
fi

if [[ ! -f "$LEGACY_ROOT_STATE_LIST_FILE" || ! -r "$LEGACY_ROOT_STATE_LIST_FILE" ]]; then
  printf 'ERROR: LEGACY_ROOT_STATE_LIST_UNREADABLE=%s\n' \
    "$LEGACY_ROOT_STATE_LIST_FILE" >&2
  exit 1
fi

if grep -F -x \
    -e 'google_storage_bucket.media' \
    -e 'google_storage_bucket_iam_member.runtime_media_objects' \
    -- "$LEGACY_ROOT_STATE_LIST_FILE" >/dev/null; then
  printf '%s\n' 'ERROR: LEGACY_ROOT_MEDIA_STATE_HANDOFF_INCOMPLETE' >&2
  printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
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

if ! state_resources="$(terraform -chdir=infra/iac/media state list)"; then
  printf '%s\n' 'ERROR: TERRAFORM_STATE_LIST_FAILED' >&2
  printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
  exit 1
fi

unexpected_state_resources="$(
  grep -F -x -v \
    -e 'google_storage_bucket.media' \
    -e 'google_storage_bucket_iam_member.runtime_media_objects' \
    <<< "$state_resources" || true
)"

if [[ -n "$unexpected_state_resources" ]]; then
  printf 'ERROR: UNEXPECTED_MEDIA_STATE_RESOURCES=%s\n' \
    "$(tr '\n' ',' <<< "$unexpected_state_resources" | sed 's/,$//')" >&2
  printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
  exit 1
fi

if grep -F -x -- 'google_storage_bucket.media' <<< "$state_resources" >/dev/null; then
  if ! tracked_media_identity="$(
    terraform -chdir=infra/iac/media show -json |
      jq -er '
        [
          .values.root_module
          | ..
          | objects
          | .resources? // empty
          | .[]
          | select(.address == "google_storage_bucket.media")
        ]
        | if length == 1 then
            .[0].values
            | select(
                (.name | type == "string") and
                (.project | type == "string") and
                (.location | type == "string")
              )
            | [.name, .project, .location]
            | @tsv
          else
            empty
          end
      '
  )"; then
    printf '%s\n' 'ERROR: TRACKED_MEDIA_BUCKET_IDENTITY_UNREADABLE' >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi

  IFS=$'\t' read -r tracked_media_bucket tracked_media_project tracked_media_region \
    <<< "$tracked_media_identity"

  if [[ "$tracked_media_bucket" != "$MEDIA_BUCKET" ]]; then
    printf 'ERROR: TRACKED_MEDIA_BUCKET_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
      "$MEDIA_BUCKET" "$tracked_media_bucket" >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi

  if [[ "$tracked_media_project" != "$PROJECT_ID" ]]; then
    printf 'ERROR: TRACKED_MEDIA_PROJECT_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
      "$PROJECT_ID" "$tracked_media_project" >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi

  if [[ "${tracked_media_region,,}" != "${REGION,,}" ]]; then
    printf 'ERROR: TRACKED_MEDIA_REGION_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
      "$REGION" "$tracked_media_region" >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi
fi

if grep -F -x -- 'google_storage_bucket_iam_member.runtime_media_objects' \
    <<< "$state_resources" >/dev/null; then
  if ! tracked_runtime_identity="$(
    terraform -chdir=infra/iac/media show -json |
      jq -er '
        [
          .values.root_module
          | ..
          | objects
          | .resources? // empty
          | .[]
          | select(.address == "google_storage_bucket_iam_member.runtime_media_objects")
        ]
        | if length == 1 then
            .[0].values
            | select((.bucket | type == "string") and (.member | type == "string"))
            | [.bucket, .member]
            | @tsv
          else
            empty
          end
      '
  )"; then
    printf '%s\n' 'ERROR: TRACKED_RUNTIME_MEDIA_IDENTITY_UNREADABLE' >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi

  IFS=$'\t' read -r tracked_runtime_bucket tracked_runtime_member \
    <<< "$tracked_runtime_identity"

  if [[ "$tracked_runtime_bucket" != "$MEDIA_BUCKET" ]]; then
    printf 'ERROR: TRACKED_RUNTIME_BUCKET_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
      "$MEDIA_BUCKET" "$tracked_runtime_bucket" >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi

  if [[ "$tracked_runtime_member" != "serviceAccount:${RUNTIME_SA}" ]]; then
    printf 'ERROR: TRACKED_RUNTIME_MEMBER_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
      "serviceAccount:${RUNTIME_SA}" "$tracked_runtime_member" >&2
    printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
    exit 1
  fi
fi

if ! project_media_buckets="$(
  gcloud storage buckets list \
    --project="$PROJECT_ID" \
    --filter="name=${MEDIA_BUCKET}" \
    --format='value(name)'
)"; then
  printf '%s\n' 'ERROR: MEDIA_BUCKET_EXISTENCE_CHECK_FAILED' >&2
  printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
  exit 1
fi

if grep -F -x -- "$MEDIA_BUCKET" <<< "$project_media_buckets" >/dev/null; then
  if ! grep -F -x -- 'google_storage_bucket.media' <<< "$state_resources" >/dev/null; then
    printf 'ERROR: EXISTING_MEDIA_BUCKET_REQUIRES_REVIEWED_STATE_HANDOFF=%s\n' \
      "$MEDIA_BUCKET" >&2
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
