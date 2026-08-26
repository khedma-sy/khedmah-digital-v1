#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
REGION="${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
BUCKET="${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"
RUNTIME_SA="${OPERATIONS_RUNTIME_SERVICE_ACCOUNT:?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required}"

gcloud storage buckets describe "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --format=json > /tmp/khedmah-media-bucket.json

jq -e --arg region "${REGION}" '
  (.location | ascii_downcase) == ($region | ascii_downcase) and
  .iamConfiguration.uniformBucketLevelAccess.enabled == true and
  .iamConfiguration.publicAccessPrevention == "enforced"
' /tmp/khedmah-media-bucket.json >/dev/null

gcloud storage buckets get-iam-policy "gs://${BUCKET}" --format=json |
  jq -e --arg member "serviceAccount:${RUNTIME_SA}" '
    any(.bindings[]; .role == "roles/storage.objectAdmin" and (.members | index($member))) and
    all(.bindings[]; (.members // []) | index("allUsers") | not)
  ' >/dev/null

printf 'READY: PRIVATE_MEDIA_BUCKET=%s\n' "${BUCKET}"
printf 'READY: MEDIA_RUNTIME=%s\n' "${RUNTIME_SA}"
