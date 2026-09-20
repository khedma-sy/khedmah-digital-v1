#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-fulfillment-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-fulfillment-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${FULFILLMENT_MIGRATIONS_026_028_MODE:-off}"
readonly migration_026_blob='751262c11264815488136847e39e3dc162feab85'
readonly migration_027_blob='af18327bf03735f6ceaba5f5a60ab973822db355'
readonly migration_028_blob='a4dc42dac87226a3628d282d027164e33212c493'

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging fulfillment schema operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
[[ "$mode" == 'off' || "$mode" == 'verify' || "$mode" == 'apply' ]] || { echo 'FULFILLMENT_MIGRATIONS_026_028_MODE must be off, verify, or apply.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing fulfillment schema operation on the production project.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Fulfillment schema operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }
if [[ "$mode" == 'off' ]]; then
  echo 'Fulfillment migrations 026-028 operation is off.'
  exit 0
fi
if [[ "$mode" == 'apply' ]]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_026_028_${environment^^}"
  [[ "${FULFILLMENT_MIGRATIONS_026_028_CONFIRMATION:-}" == "$expected_confirmation" ]] || { echo 'Explicit fulfillment migrations 026-028 confirmation token is missing or invalid.' >&2; exit 4; }
fi

verify_repo_blob() {
  local path="$1" approved="$2" actual
  actual="$(python3 - "$path" <<'PY'
from pathlib import Path
import hashlib, sys
p=Path(sys.argv[1])
data=p.read_bytes()
print(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest())
PY
)"
  [[ "$actual" == "$approved" ]] || { echo "Repository migration blob changed: $path" >&2; exit 4; }
}
verify_repo_blob backend/migrations/versions/026_cash_fulfillment_orders.sql "$migration_026_blob"
verify_repo_blob backend/migrations/versions/027_mobility_document_reviews.sql "$migration_027_blob"
verify_repo_blob backend/migrations/versions/028_platform_notifications.sql "$migration_028_blob"

tag="${environment}-${identifier}"
short_identifier="$(printf '%s' "$identifier" | sha256sum | cut -c1-10)"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/fulfillment-migration:${tag}"
job="khedmah-${environment}-fulfillment-026-028-${short_identifier}"

gcloud builds submit . \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --config cloudbuild.fulfillment-migration.yaml \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" \
  --quiet

gcloud run jobs deploy "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --image "$image" \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  --set-secrets='DATABASE_URL=DATABASE_URL:latest' \
  --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_CONFIRMATION=${FULFILLMENT_MIGRATIONS_026_028_CONFIRMATION:-}" \
  --tasks 1 \
  --parallelism 1 \
  --max-retries 0 \
  --task-timeout 10m \
  --quiet

set +e
execution_output="$(gcloud run jobs execute "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait 2>&1)"
execution_status=$?
set -e
printf '%s\n' "$execution_output"
if [[ "$execution_status" -ne 0 ]]; then
  echo "Fulfillment migrations 026-028 ${mode} execution failed; collecting non-production diagnostics." >&2
  execution_name="$(gcloud run jobs executions list \
    --job "$job" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --limit 1 \
    --sort-by='~metadata.creationTimestamp' \
    --format='value(metadata.name)' 2>/dev/null || true)"
  if [[ -n "$execution_name" ]]; then
    echo "FULFILLMENT_026_028_FAILED_EXECUTION=${execution_name}" >&2
    gcloud run jobs executions describe "$execution_name" \
      --project "$GOOGLE_CLOUD_PROJECT" \
      --region "$GOOGLE_CLOUD_REGION" \
      --format='yaml(metadata.name,status.conditions,status.failedCount,status.succeededCount,status.startTime,status.completionTime,status.logUri)' || true
  fi
  echo 'FULFILLMENT_026_028_CONTAINER_LOGS_BEGIN' >&2
  gcloud logging read \
    "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${job}\"" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --freshness=30m \
    --limit=200 \
    --order=asc \
    --format='value(timestamp,severity,textPayload,jsonPayload.message)' || true
  echo 'FULFILLMENT_026_028_CONTAINER_LOGS_END' >&2
  exit "$execution_status"
fi
printf 'Fulfillment migrations 026-028 %s completed and verified for %s.\n' "$mode" "$environment"
