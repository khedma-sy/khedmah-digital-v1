#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-taxi-operational-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-taxi-operational-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${TAXI_OPERATIONAL_MIGRATION_031_MODE:-off}"
readonly migration_sha256='148dfe66ee1a2c838225a14fe90dcac51e8c7a87ee56d277275142e20bcc6f5b'
readonly migration_git_blob='e557c132d1dff6ea4aadedcb25978a1c2d7cf410'

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging Taxi operational schema operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
[[ "$mode" == 'off' || "$mode" == 'verify' || "$mode" == 'apply' ]] || { echo 'TAXI_OPERATIONAL_MIGRATION_031_MODE must be off, verify, or apply.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing Taxi operational schema operation on the production project.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Taxi operational schema operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }
if [[ "$mode" == 'off' ]]; then echo 'Taxi operational migration 031 operation is off.'; exit 0; fi
if [[ "$mode" == 'apply' ]]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_031_${environment^^}"
  [[ "${TAXI_OPERATIONAL_MIGRATION_031_CONFIRMATION:-}" == "$expected_confirmation" ]] || { echo 'Explicit Taxi operational migration 031 confirmation token is missing or invalid.' >&2; exit 4; }
fi

migration='backend/migrations/versions/031_taxi_operational_approvals.sql'
actual_sha256="$(sha256sum "$migration" | awk '{print $1}')"
[[ "$actual_sha256" == "$migration_sha256" ]] || { echo 'Repository Taxi operational migration checksum changed.' >&2; exit 4; }
actual_git_blob="$(git hash-object "$migration")"
[[ "$actual_git_blob" == "$migration_git_blob" ]] || { echo 'Repository Taxi operational migration Git blob changed.' >&2; exit 4; }

tag="${environment}-${identifier}"
short_identifier="$(printf '%s' "$identifier" | sha256sum | cut -c1-10)"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/taxi-operational-migration:${tag}"
job="khedmah-${environment}-taxi-operational-031-${short_identifier}"

gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config cloudbuild.taxi-operational-migration.yaml \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" --quiet

gcloud run jobs deploy "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$image" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" --set-secrets='DATABASE_URL=DATABASE_URL:latest' \
  --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_CONFIRMATION=${TAXI_OPERATIONAL_MIGRATION_031_CONFIRMATION:-},MIGRATION_SHA256=${migration_sha256}" \
  --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 10m --quiet

set +e
execution_output="$(gcloud run jobs execute "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait 2>&1)"
execution_status=$?
set -e
printf '%s\n' "$execution_output"
if [[ "$execution_status" -ne 0 ]]; then
  echo 'Taxi operational migration 031 execution failed; collecting bounded non-production diagnostics.' >&2
  execution_name="$(gcloud run jobs executions list --job "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(metadata.name)' --limit=1 2>/dev/null || true)"
  if [[ -n "$execution_name" ]]; then
    printf 'TAXI_031_FAILED_EXECUTION=%s\n' "$execution_name" >&2
    gcloud run jobs executions describe "$execution_name" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
      --format='yaml(metadata.name,status.conditions,status.failedCount,status.succeededCount,status.startTime,status.completionTime,status.logUri)' >&2 || true
  fi
  echo 'TAXI_031_CONTAINER_LOGS_BEGIN' >&2
  gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${job}\"" \
    --project "$GOOGLE_CLOUD_PROJECT" --freshness=30m --limit=200 --order=asc \
    --format='value(timestamp,severity,textPayload,jsonPayload.message)' >&2 || true
  echo 'TAXI_031_CONTAINER_LOGS_END' >&2
  exit "$execution_status"
fi

printf 'Taxi operational migration 031 %s completed and verified for %s.\n' "$mode" "$environment"
