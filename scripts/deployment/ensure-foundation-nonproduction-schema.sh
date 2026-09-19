#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-foundation-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-foundation-nonproduction-schema.sh preview|staging IDENTIFIER}"

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging foundation operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing foundation operation on Production.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Foundation operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }

files=(
  backend/migrations/versions/001_core_identity_accounts.sql
  backend/migrations/versions/002_create_profiles.sql
  backend/migrations/versions/003_create_professional_profiles.sql
  backend/migrations/versions/004_analytics_and_contact.sql
  backend/migrations/versions/005_email_verifications_and_admin_roles.sql
  backend/migrations/versions/006_media_assets.sql
  backend/migrations/versions/007_v2_marketplace.sql
  backend/migrations/versions/008_provider_service_radius.sql
  backend/migrations/versions/009_canonical_identity_runtime.sql
  backend/migrations/versions/010_canonical_runtime_domains.sql
  backend/migrations/versions/011_canonical_media_contract.sql
  backend/migrations/versions/012_nearby_preferences.sql
  backend/migrations/versions/013_nearby_notifications_read_state.sql
  backend/migrations/versions/014_supplier_discovery.sql
  backend/migrations/versions/015_contact_target_contract.sql
  backend/migrations/versions/016_contact_submission_idempotency.sql
  backend/migrations/versions/017_category_taxonomy_contract.sql
  backend/migrations/versions/018_persistent_rate_limit_buckets.sql
  backend/migrations/versions/019_remove_out_of_scope_subscription_schema.sql
  backend/migrations/versions/020_identity_recovery_oauth.sql
  backend/migrations/versions/021_provider_reports.sql
  backend/migrations/versions/022_expand_category_taxonomy.sql
)
for file in "${files[@]}"; do [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 4; }; done
manifest_sha256="$(cat "${files[@]}" | sha256sum | awk '{print $1}')"

tag="${environment}-${identifier}"
short_identifier="$(printf '%s' "$identifier" | sha256sum | cut -c1-10)"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/foundation-migrations:${tag}"
job="khedmah-${environment}-foundation-001-022-${short_identifier}"
source_args=()
if [[ "$environment" == 'staging' ]]; then
  source_args=(--gcs-source-staging-dir "gs://${GOOGLE_CLOUD_PROJECT}-cloudbuild-source/source")
fi

gcloud builds submit . \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  "${source_args[@]}" \
  --config cloudbuild.foundation-nonproduction.yaml \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" \
  --quiet

gcloud run jobs deploy "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --image "$image" \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  --set-secrets='DATABASE_URL=DATABASE_URL:latest' \
  --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},FOUNDATION_MANIFEST_SHA256=${manifest_sha256}" \
  --tasks 1 \
  --parallelism 1 \
  --max-retries 0 \
  --task-timeout 15m \
  --quiet

gcloud run jobs execute "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --wait

printf 'Foundation 001-022 completed and verified for %s.\n' "$environment"
