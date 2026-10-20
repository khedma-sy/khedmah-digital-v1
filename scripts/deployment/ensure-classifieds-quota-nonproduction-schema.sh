#!/usr/bin/env bash
set -euo pipefail
environment="${1:?usage: ensure-classifieds-quota-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-classifieds-quota-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${CLASSIFIEDS_QUOTA_MIGRATION_036_MODE:-off}"
readonly migration_sha256='8ed732624b0baf5f5457d138692622214fe2d7b2dd556b79974d23bd0c76093b'
[[ "$environment" == preview || "$environment" == staging ]] || exit 2
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
[[ "$mode" == off || "$mode" == verify || "$mode" == apply ]] || exit 2
if [[ "$mode" == off ]]; then echo 'Classifieds quota migration 036 operation is off.'; exit 0; fi
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do [[ -n "${!name:-}" ]] || exit 3; done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || exit 4
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || exit 4
if [[ "$mode" == apply ]]; then [[ "${CLASSIFIEDS_QUOTA_MIGRATION_036_CONFIRMATION:-}" == "APPLY_KHEDMAH_NONPROD_036_${environment^^}" ]] || exit 4; fi
[[ "$(sha256sum backend/migrations/versions/036_classifieds_rolling_publication_quota.sql | awk '{print $1}')" == "$migration_sha256" ]] || exit 4
source "$(dirname "${BASH_SOURCE[0]}")/schema-execution-profile.sh"
resolve_schema_execution "$environment" "$mode"
tag="${environment}-${identifier}"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/classifieds-quota-migration:${tag}"
stage='classifieds-quota-036'
job="$(node scripts/deployment/preview-schema-job-pool.mjs name "$environment" "$identifier" "$stage")"
pool_label_args=()
if [[ "$environment" == 'preview' ]]; then
  pool_label_args=(--labels="khedmah-schema-pool=bounded-v1,khedmah-schema-stage=${stage}")
fi
gcloud builds submit . "${SCHEMA_BUILD_ARGS[@]}" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config cloudbuild.classifieds-quota-migration.yaml --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" --quiet
node scripts/deployment/preview-schema-job-pool.mjs before-deploy "$environment" "$identifier" "$stage"
gcloud run jobs deploy "$job" "${pool_label_args[@]}" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$image" --service-account "$SCHEMA_SERVICE_ACCOUNT" --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" --set-secrets="$SCHEMA_DATABASE_SECRET_BINDING" --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_CONFIRMATION=${CLASSIFIEDS_QUOTA_MIGRATION_036_CONFIRMATION:-},MIGRATION_SHA256=${migration_sha256}" --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 10m --quiet
node scripts/deployment/preview-schema-job-pool.mjs before-execute "$environment" "$identifier" "$stage"
gcloud run jobs execute "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait
