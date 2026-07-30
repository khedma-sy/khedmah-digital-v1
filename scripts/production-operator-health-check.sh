#!/usr/bin/env bash
set -euo pipefail
set +x

backend_url="$(gcloud run services describe "$OPERATIONS_BACKEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
frontend_url="$(gcloud run services describe "$OPERATIONS_FRONTEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
[[ -n "$backend_url" && -n "$frontend_url" ]] || { echo 'Cloud Run service URL unavailable.' >&2; exit 40; }

start="$SECONDS"
curl --fail --silent --show-error --retry 6 --retry-all-errors "$backend_url/api/v1/health" >/dev/null
backend_seconds=$((SECONDS-start))
start="$SECONDS"
curl --fail --silent --show-error --retry 6 --retry-all-errors "$frontend_url/" >/dev/null
frontend_seconds=$((SECONDS-start))

mkdir -p "$EVIDENCE_DIRECTORY"
jq -n --argjson backendSeconds "$backend_seconds" --argjson frontendSeconds "$frontend_seconds" \
  '{backend:{healthy:true,durationSeconds:$backendSeconds},frontend:{healthy:true,durationSeconds:$frontendSeconds},urlsRecorded:false}' \
  > "$EVIDENCE_DIRECTORY/health-check.json"
echo 'Production health checks passed; service URLs were not written to evidence.'
