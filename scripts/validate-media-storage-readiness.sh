#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
MEDIA_LOCATION="${GCS_MEDIA_LOCATION:?GCS_MEDIA_LOCATION is required}"
BUCKET="${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"
RUNTIME_SA="${OPERATIONS_RUNTIME_SERVICE_ACCOUNT:?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required}"

if [[ "$MEDIA_LOCATION" != "europe-west1" ]]; then
  printf 'ERROR: EXPECTED_MEDIA_LOCATION=europe-west1 ACTUAL_MEDIA_LOCATION=%s\n' \
    "$MEDIA_LOCATION" >&2
  exit 1
fi

bucket_json="$(mktemp)"
policy_json="$(mktemp)"
trap 'rm -f "$bucket_json" "$policy_json"' EXIT

gcloud storage buckets describe "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --format=json > "$bucket_json"

jq -e --arg location "${MEDIA_LOCATION}" '
  (.location | ascii_downcase) == ($location | ascii_downcase) and
  (
    (.uniform_bucket_level_access == true) or
    (.iamConfiguration.uniformBucketLevelAccess.enabled == true)
  ) and
  (
    (.public_access_prevention == "enforced") or
    (.iamConfiguration.publicAccessPrevention == "enforced")
  ) and
  (
    (.versioning_enabled == true) or
    (.versioning.enabled == true)
  ) and
  (
    (.soft_delete_policy.retentionDurationSeconds == "2592000") or
    (.softDeletePolicy.retentionDurationSeconds == "2592000")
  )
' "$bucket_json" >/dev/null

gcloud storage buckets get-iam-policy "gs://${BUCKET}" --format=json > "$policy_json"
jq -e --arg member "serviceAccount:${RUNTIME_SA}" '
  any(
    .bindings[]?;
    .role == "roles/storage.objectAdmin" and
    ((has("condition") | not) or .condition == null) and
    any(.members[]?; . == $member)
  ) and
  ([.bindings[]?.members[]?] |
    all(. != "allUsers" and . != "allAuthenticatedUsers"))
' "$policy_json" >/dev/null

printf 'READY: PRIVATE_MEDIA_BUCKET=%s\n' "${BUCKET}"
printf 'READY: MEDIA_RUNTIME=%s\n' "${RUNTIME_SA}"
