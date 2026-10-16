#!/usr/bin/env bash
set -euo pipefail
[[ "$#" == 1 && "$1" == '--inspect' ]] || { echo 'STOP: USE_INSPECT_ONLY' >&2; exit 2; }
export CLOUDSDK_CORE_DISABLE_PROMPTS=true
export CLOUDSDK_CORE_LOG_HTTP=false
export CLOUDSDK_CORE_DISABLE_FILE_LOGGING=true
project='khedmah-preview-v2-20261012'
bucket='gs://khedmah-preview-v2-20261012.firebasestorage.app'
read_flags=(--project="$project" --account=haifawi30@gmail.com --user-output-enabled --verbosity=error)
number="$(gcloud projects describe "$project" "${read_flags[@]}" --format='value(projectNumber)')"
[[ "$number" == '1044962071847' ]] || { echo 'STOP: PROJECT_IDENTITY_MISMATCH' >&2; exit 1; }

# This is configuration/IAM metadata only. No objects, credentials, impersonation,
# secret payloads, policy updates or data-plane probes are requested.
printf 'PREVIEW_MEDIA_BUCKET_METADATA\n'
gcloud storage buckets describe "$bucket" --raw "${read_flags[@]}" \
  --format='json(name,projectNumber,location,iamConfiguration)'
printf 'PREVIEW_MEDIA_BUCKET_DIRECT_IAM\n'
gcloud storage buckets get-iam-policy "$bucket" "${read_flags[@]}" --format=json
printf 'PREVIEW_RUNTIME_AND_PUBLIC_PROJECT_BINDINGS_ONLY\n'
gcloud projects get-iam-policy "$project" "${read_flags[@]}" \
  --flatten='bindings[].members' \
  --filter='bindings.members~"^(serviceAccount:khedmah-pv2-runtime@khedmah-preview-v2-20261012[.]iam[.]gserviceaccount[.]com|allUsers|allAuthenticatedUsers)$"' \
  --format='json(bindings)'
printf '{"stage":"PREVIEW_V2_MEDIA_IAM_READ_COMPLETED_NO_MUTATION","project":"khedmah-preview-v2-20261012","evidence_utc":"%s","cloud_mutation":false,"secret_payload_access":false,"object_data_access":false,"full_effective_iam_verified":false,"runtime_storage_access_verified":false,"application_deployed":false,"floot_connected":false}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
