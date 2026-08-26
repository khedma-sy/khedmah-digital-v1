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

gcloud storage buckets describe "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --format=json > /tmp/khedmah-media-bucket.json

jq -e --arg location "${MEDIA_LOCATION}" '
  (.location | ascii_downcase) == ($location | ascii_downcase) and
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
