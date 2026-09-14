#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-taxi-pricing-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-taxi-pricing-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${TAXI_PRICING_MIGRATION_029_MODE:-off}"
readonly migration_sha256='df9a7467f59f00e0167233901e6d7bb1e686994e8f97aec43696d53ac2d7870e'

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging Taxi pricing schema operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
[[ "$mode" == 'off' || "$mode" == 'verify' || "$mode" == 'apply' ]] || { echo 'TAXI_PRICING_MIGRATION_029_MODE must be off, verify, or apply.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing Taxi pricing schema operation on the production project.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Taxi pricing schema operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }
if [[ "$mode" == 'off' ]]; then
  echo 'Taxi pricing migration 029 operation is off.'
  exit 0
fi
if [[ "$mode" == 'apply' ]]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_029_${environment^^}"
  [[ "${TAXI_PRICING_MIGRATION_029_CONFIRMATION:-}" == "$expected_confirmation" ]] || { echo 'Explicit Taxi pricing migration 029 confirmation token is missing or invalid.' >&2; exit 4; }
fi

actual_sha256="$(sha256sum backend/migrations/versions/029_taxi_pricing_revisions.sql | awk '{print $1}')"
[[ "$actual_sha256" == "$migration_sha256" ]] || { echo 'Repository Taxi pricing migration blob changed.' >&2; exit 4; }

tag="${environment}-${identifier}"
short_identifier="$(printf '%s' "$identifier" | sha256sum | cut -c1-10)"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/taxi-pricing-migration:${tag}"
job="khedmah-${environment}-taxi-pricing-029-${short_identifier}"

gcloud builds submit . \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --config cloudbuild.taxi-pricing-migration.yaml \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" \
  --quiet

gcloud run jobs deploy "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --image "$image" \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  --set-secrets='DATABASE_URL=DATABASE_URL:latest' \
  --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_CONFIRMATION=${TAXI_PRICING_MIGRATION_029_CONFIRMATION:-},MIGRATION_SHA256=${migration_sha256}" \
  --tasks 1 \
  --parallelism 1 \
  --max-retries 0 \
  --task-timeout 10m \
  --quiet

gcloud run jobs execute "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --wait

printf 'Taxi pricing migration 029 %s completed and verified for %s.\n' "$mode" "$environment"
