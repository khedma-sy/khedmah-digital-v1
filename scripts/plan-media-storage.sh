#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
REGION="${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
STATE_BUCKET="${TF_STATE_BUCKET:?TF_STATE_BUCKET is required}"
MEDIA_BUCKET="${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"
RUNTIME_SA="${OPERATIONS_RUNTIME_SERVICE_ACCOUNT:?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required}"
EXPECTED_LEGACY_ROOT_STATE_LINEAGE="${LEGACY_ROOT_STATE_LINEAGE:?LEGACY_ROOT_STATE_LINEAGE is required}"
EXPECTED_LEGACY_ROOT_STATE_SERIAL="${LEGACY_ROOT_STATE_SERIAL:?LEGACY_ROOT_STATE_SERIAL is required}"
EXPECTED_STATE_PREFIX="khedmah/production/media"
STATE_PREFIX="${TF_STATE_PREFIX:-$EXPECTED_STATE_PREFIX}"
EXPECTED_LEGACY_ROOT_STATE_PREFIX="khedmah/production/root"

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

assert_legacy_root_released() {
  local failure_marker="${1:-NO_TERRAFORM_PLAN_CREATED}"
  local legacy_state_identity
  local legacy_state_lineage
  local legacy_state_serial

  if ! terraform -chdir=infra/iac state pull > "$legacy_state_json"; then
    printf '%s\n' 'ERROR: LEGACY_ROOT_STATE_QUERY_FAILED' >&2
    printf '%s\n' "$failure_marker" >&2
    exit 1
  fi

  if ! legacy_state_identity="$(
    jq -er '
      select(.version == 4)
      | select((.lineage | type == "string") and (.lineage | length > 0))
      | select((.serial | type == "number") and .serial >= 0)
      | [.lineage, (.serial | tostring)]
      | @tsv
    ' "$legacy_state_json"
  )"; then
    printf '%s\n' 'ERROR: LEGACY_ROOT_STATE_IDENTITY_UNREADABLE' >&2
    printf '%s\n' "$failure_marker" >&2
    exit 1
  fi

  IFS=$'\t' read -r legacy_state_lineage legacy_state_serial \
    <<< "$legacy_state_identity"

  if [[ "$legacy_state_lineage" != "$EXPECTED_LEGACY_ROOT_STATE_LINEAGE" ]]; then
    printf 'ERROR: LEGACY_ROOT_STATE_LINEAGE_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
      "$EXPECTED_LEGACY_ROOT_STATE_LINEAGE" "$legacy_state_lineage" >&2
    printf '%s\n' "$failure_marker" >&2
    exit 1
  fi

  if [[ -z "$observed_legacy_root_state_serial" ]]; then
    if [[ "$legacy_state_serial" != "$EXPECTED_LEGACY_ROOT_STATE_SERIAL" ]]; then
      printf 'ERROR: LEGACY_ROOT_STATE_SERIAL_MISMATCH EXPECTED=%s ACTUAL=%s\n' \
        "$EXPECTED_LEGACY_ROOT_STATE_SERIAL" "$legacy_state_serial" >&2
      printf '%s\n' "$failure_marker" >&2
      exit 1
    fi
    observed_legacy_root_state_serial="$legacy_state_serial"
  elif [[ "$legacy_state_serial" != "$observed_legacy_root_state_serial" ]]; then
    printf 'ERROR: LEGACY_ROOT_STATE_CHANGED_DURING_PLAN BEFORE=%s AFTER=%s\n' \
      "$observed_legacy_root_state_serial" "$legacy_state_serial" >&2
    printf '%s\n' "$failure_marker" >&2
    exit 1
  fi

  if jq -e '
      any(
        .resources[]?;
        ((.module? // "") == "") and
        (
          (.type == "google_storage_bucket" and .name == "media") or
          (
            .type == "google_storage_bucket_iam_member" and
            .name == "runtime_media_objects"
          )
        )
      )
    ' "$legacy_state_json" >/dev/null; then
    printf '%s\n' 'ERROR: LEGACY_ROOT_MEDIA_STATE_HANDOFF_INCOMPLETE' >&2
    printf '%s\n' "$failure_marker" >&2
    exit 1
  fi
}

legacy_state_json="$(mktemp)"
state_json="$(mktemp)"
plan_json="$(mktemp)"
pending_plan_file=''
cleanup() {
  rm -f "$legacy_state_json" "$state_json" "$plan_json"
  if [[ -n "$pending_plan_file" ]]; then
    rm -f "$pending_plan_file"
  fi
}
trap cleanup EXIT
observed_legacy_root_state_serial=''

terraform -chdir=infra/iac init \
  -input=false \
  -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=${EXPECTED_LEGACY_ROOT_STATE_PREFIX}"

assert_legacy_root_released

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
if [[ -e "$plan_file" ]]; then
  printf 'ERROR: MEDIA_TERRAFORM_PLAN_ALREADY_EXISTS=%s\n' "$plan_file" >&2
  printf '%s\n' 'NO_TERRAFORM_PLAN_CREATED' >&2
  exit 1
fi

plan_directory="$(dirname -- "$plan_file")"
plan_basename="$(basename -- "$plan_file")"
pending_plan_file="$(mktemp "${plan_directory}/.${plan_basename}.pending.XXXXXX")"
terraform -chdir=infra/iac/media plan \
  -input=false \
  -lock-timeout=60s \
  -out="$pending_plan_file" \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="bucket_name=${MEDIA_BUCKET}" \
  -var="runtime_service_account_email=${RUNTIME_SA}"

if ! terraform -chdir=infra/iac/media show -json "$pending_plan_file" > "$plan_json"; then
  printf '%s\n' 'ERROR: MEDIA_TERRAFORM_PLAN_UNREADABLE' >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

unexpected_plan_resources="$(
  jq -r '
    [(.resource_changes // [])[]?.address]
    | unique[]
    | select(
        . != "google_storage_bucket.media" and
        . != "google_storage_bucket_iam_member.runtime_media_objects"
      )
  ' "$plan_json"
)"

if [[ -n "$unexpected_plan_resources" ]]; then
  printf 'ERROR: UNEXPECTED_MEDIA_PLAN_RESOURCES=%s\n' \
    "$(tr '\n' ',' <<< "$unexpected_plan_resources" | sed 's/,$//')" >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

destructive_plan_resources="$(
  jq -r '
    (.resource_changes // [])[]
    | select((.change.actions // []) | index("delete"))
    | .address
  ' "$plan_json"
)"

if [[ -n "$destructive_plan_resources" ]]; then
  printf 'ERROR: DESTRUCTIVE_MEDIA_PLAN_CHANGES=%s\n' \
    "$(tr '\n' ',' <<< "$destructive_plan_resources" | sed 's/,$//')" >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

if ! planned_media_identity="$(
  jq -er '
    [
      .planned_values.root_module
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
  ' "$plan_json"
)"; then
  printf '%s\n' 'ERROR: PLANNED_MEDIA_BUCKET_IDENTITY_UNREADABLE' >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

IFS=$'\t' read -r planned_media_bucket planned_media_project planned_media_region \
  <<< "$planned_media_identity"

if [[ "$planned_media_bucket" != "$MEDIA_BUCKET" || \
      "$planned_media_project" != "$PROJECT_ID" || \
      "${planned_media_region,,}" != "${REGION,,}" ]]; then
  printf 'ERROR: PLANNED_MEDIA_BUCKET_IDENTITY_MISMATCH EXPECTED=%s,%s,%s ACTUAL=%s,%s,%s\n' \
    "$MEDIA_BUCKET" "$PROJECT_ID" "$REGION" \
    "$planned_media_bucket" "$planned_media_project" "$planned_media_region" >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

if ! planned_runtime_identity="$(
  jq -er '
    [
      .planned_values.root_module
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
  ' "$plan_json"
)"; then
  printf '%s\n' 'ERROR: PLANNED_RUNTIME_MEDIA_IDENTITY_UNREADABLE' >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

IFS=$'\t' read -r planned_runtime_bucket planned_runtime_member \
  <<< "$planned_runtime_identity"

if [[ "$planned_runtime_bucket" != "$MEDIA_BUCKET" || \
      "$planned_runtime_member" != "serviceAccount:${RUNTIME_SA}" ]]; then
  printf 'ERROR: PLANNED_RUNTIME_MEDIA_IDENTITY_MISMATCH EXPECTED=%s,%s ACTUAL=%s,%s\n' \
    "$MEDIA_BUCKET" "serviceAccount:${RUNTIME_SA}" \
    "$planned_runtime_bucket" "$planned_runtime_member" >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi

# Re-query the canonical legacy working directory after planning so a concurrent
# ownership change cannot be reported as a reviewed, ready handoff.
assert_legacy_root_released NO_APPROVED_TERRAFORM_PLAN

mv -n -- "$pending_plan_file" "$plan_file"
if [[ -e "$pending_plan_file" ]]; then
  printf 'ERROR: MEDIA_TERRAFORM_PLAN_PUBLISH_FAILED=%s\n' "$plan_file" >&2
  printf '%s\n' 'NO_APPROVED_TERRAFORM_PLAN' >&2
  exit 1
fi
pending_plan_file=''

printf 'READY: MEDIA_TERRAFORM_PLAN=%s\n' "$plan_file"
printf '%s\n' 'NO_TERRAFORM_APPLY'
