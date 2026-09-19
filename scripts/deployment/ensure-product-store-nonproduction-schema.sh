#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-product-store-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-product-store-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${PRODUCT_STORE_MIGRATION_024_MODE:-off}"
readonly migration_sha256='d2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6'

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging Product Store schema operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
[[ "$mode" == 'off' || "$mode" == 'verify' || "$mode" == 'apply' ]] || { echo 'PRODUCT_STORE_MIGRATION_024_MODE must be off, verify, or apply.' >&2; exit 2; }

for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done

[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing Product Store schema operation on the production project.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Product Store schema operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }

if [[ "$mode" == 'off' ]]; then
  echo 'Product Store migration 024 operation is off.'
  exit 0
fi

if [[ "$mode" == 'apply' ]]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_024_${environment^^}"
  [[ "${PRODUCT_STORE_MIGRATION_024_CONFIRMATION:-}" == "$expected_confirmation" ]] || { echo 'Explicit Product Store migration 024 confirmation token is missing or invalid.' >&2; exit 4; }
fi

actual_sha256="$(sha256sum backend/migrations/versions/024_product_store.sql | awk '{print $1}')"
[[ "$actual_sha256" == "$migration_sha256" ]] || { echo 'Repository migration 024 checksum changed; review is required.' >&2; exit 4; }

tag="${environment}-${identifier}"
short_identifier="$(printf '%s' "$identifier" | sha256sum | cut -c1-10)"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/product-store-migration:${tag}"
job="khedmah-${environment}-product-store-024-${short_identifier}"

gcloud builds submit .   --project "$GOOGLE_CLOUD_PROJECT"   --region "$GOOGLE_CLOUD_REGION"   --config cloudbuild.product-store-migration.yaml   --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}"   --quiet

gcloud run jobs deploy "$job"   --project "$GOOGLE_CLOUD_PROJECT"   --region "$GOOGLE_CLOUD_REGION"   --image "$image"   --service-account "$RUNTIME_SERVICE_ACCOUNT"   --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME"   --set-secrets='DATABASE_URL=DATABASE_URL:latest'   --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_SHA256=${migration_sha256},MIGRATION_CONFIRMATION=${PRODUCT_STORE_MIGRATION_024_CONFIRMATION:-}"   --tasks 1   --parallelism 1   --max-retries 0   --task-timeout 10m   --quiet

set +e
execution_output="$(gcloud run jobs execute "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait 2>&1)"
execution_status=$?
set -e
printf '%s\n' "$execution_output"

if [[ "$execution_status" -ne 0 ]]; then
  echo "Product Store migration 024 ${mode} execution failed; collecting non-production diagnostics." >&2
  execution_name="$(gcloud run jobs executions list     --job "$job"     --project "$GOOGLE_CLOUD_PROJECT"     --region "$GOOGLE_CLOUD_REGION"     --limit 1     --sort-by='~metadata.creationTimestamp'     --format='value(metadata.name)' 2>/dev/null || true)"
  if [[ -n "$execution_name" ]]; then
    echo "PRODUCT_STORE_024_FAILED_EXECUTION=${execution_name}" >&2
    gcloud run jobs executions describe "$execution_name"       --project "$GOOGLE_CLOUD_PROJECT"       --region "$GOOGLE_CLOUD_REGION"       --format='yaml(metadata.name,status.conditions,status.failedCount,status.succeededCount,status.startTime,status.completionTime,status.logUri)' || true
  fi
  echo 'PRODUCT_STORE_024_CONTAINER_LOGS_BEGIN' >&2
  gcloud logging read     "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${job}\""     --project "$GOOGLE_CLOUD_PROJECT"     --freshness=30m     --limit=200     --order=asc     --format='value(timestamp,severity,textPayload,jsonPayload.message)' || true
  echo 'PRODUCT_STORE_024_CONTAINER_LOGS_END' >&2
  exit "$execution_status"
fi

printf 'Product Store migration 024 %s completed and verified for %s.\n' "$mode" "$environment"
