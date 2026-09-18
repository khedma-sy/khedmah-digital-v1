#!/usr/bin/env bash
set -euo pipefail
environment="${1:?usage: deploy-cloud-run-environment.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: deploy-cloud-run-environment.sh preview|staging IDENTIFIER}"
[[ "$environment" == "preview" || "$environment" == "staging" ]] || { echo 'Only preview or staging deployment is allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT PRODUCTION_GOOGLE_CLOUD_PROJECT; do [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }; done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing to deploy to the production project.' >&2; exit 4; }
CLASSIFIEDS_ENABLED="${CLASSIFIEDS_ENABLED:-false}"
NEXT_PUBLIC_CLASSIFIEDS_ENABLED="${NEXT_PUBLIC_CLASSIFIEDS_ENABLED:-false}"
CLASSIFIEDS_MIGRATION_025_MODE="${CLASSIFIEDS_MIGRATION_025_MODE:-off}"
TAXI_TRIPS_ENABLED="${TAXI_TRIPS_ENABLED:-false}"
for value in "$CLASSIFIEDS_ENABLED" "$NEXT_PUBLIC_CLASSIFIEDS_ENABLED"; do
  [[ "$value" == 'true' || "$value" == 'false' ]] || { echo 'Classifieds feature flags must be literal true or false.' >&2; exit 2; }
done
[[ "$TAXI_TRIPS_ENABLED" == 'true' || "$TAXI_TRIPS_ENABLED" == 'false' ]] || { echo 'TAXI_TRIPS_ENABLED must be literal true or false.' >&2; exit 2; }
[[ "$TAXI_TRIPS_ENABLED" != 'true' ]] || { echo 'Taxi trips cannot be enabled by this deployment path while the Taxi SQL remains candidate-only.' >&2; exit 4; }
[[ "$CLASSIFIEDS_MIGRATION_025_MODE" == 'off' || "$CLASSIFIEDS_MIGRATION_025_MODE" == 'verify' || "$CLASSIFIEDS_MIGRATION_025_MODE" == 'apply' ]] || { echo 'CLASSIFIEDS_MIGRATION_025_MODE must be off, verify, or apply.' >&2; exit 2; }
[[ "$NEXT_PUBLIC_CLASSIFIEDS_ENABLED" != 'true' || "$CLASSIFIEDS_ENABLED" == 'true' ]] || { echo 'Frontend Classifieds cannot be enabled before backend Classifieds.' >&2; exit 4; }
[[ "$CLASSIFIEDS_ENABLED" != 'true' || "$CLASSIFIEDS_MIGRATION_025_MODE" != 'off' ]] || { echo 'Backend Classifieds requires migration 025 verification before enablement.' >&2; exit 4; }
tag="${environment}-${identifier}"
[[ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]] || { echo 'Missing CLOUD_SQL_INSTANCE_CONNECTION_NAME for isolated deployment.' >&2; exit 3; }
if [[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" != "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]]; then
  if [[ "$environment" == "preview" ]]; then echo 'Preview Cloud SQL instance must belong to the preview project and region.' >&2;
  else echo 'Staging Cloud SQL instance must belong to the staging project and region.' >&2; fi
  exit 4
fi
if [[ "$environment" == "preview" ]]; then
  [[ "$identifier" =~ ^pr-[0-9]+-[0-9a-f]{7,40}$ ]] || { echo 'Preview identifier must be pr-N-SHA.' >&2; exit 2; }
  pr_number="$(cut -d- -f2 <<<"$identifier")"
  backend_service="khedmah-pr-${pr_number}-backend"
  frontend_service="khedmah-pr-${pr_number}-frontend"
  config="cloudbuild.preview.yaml"
else
  backend_service="khedmah-backend-staging"
  frontend_service="khedmah-frontend-staging"
  config="cloudbuild.staging.yaml"
fi
backend_image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/backend:${tag}"
frontend_image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/frontend:${tag}"
# Taxi authority can be enabled after Migration 031 while trip execution remains independently fail-closed.
backend_runtime_env="NODE_ENV=${environment},APP_VERSION=${tag},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},CLASSIFIEDS_ENABLED=${CLASSIFIEDS_ENABLED},TAXI_ACCESS_ENABLED=true,TAXI_TRIPS_ENABLED=${TAXI_TRIPS_ENABLED}"
backend_secret_bindings="DATABASE_URL=DATABASE_URL:latest"
if [[ "$environment" == "preview" ]]; then
  preview_email_from="$(DEPLOYMENT_ENVIRONMENT=preview bash scripts/deployment/resolve-preview-email-config.sh)"
  if [[ -n "$preview_email_from" ]]; then
    backend_runtime_env+=",EMAIL_FROM=${preview_email_from}"
    backend_secret_bindings+=",RESEND_API_KEY=RESEND_API_KEY:latest"
  fi
fi
if [[ "$environment" == "staging" ]]; then
  [[ -n "${GCS_MEDIA_BUCKET:-}" ]] || { echo 'Missing GCS_MEDIA_BUCKET for Staging persistent media.' >&2; exit 3; }
  [[ -n "${EMAIL_FROM:-}" ]] || { echo 'Missing EMAIL_FROM for Staging email delivery.' >&2; exit 3; }
  backend_runtime_env+=",GCS_MEDIA_BUCKET=${GCS_MEDIA_BUCKET},EMAIL_FROM=${EMAIL_FROM}"
  backend_secret_bindings+=",OPERATIONS_PRODUCT_ROLE_BINDINGS=OPERATIONS_PRODUCT_ROLE_BINDINGS:latest,RESEND_API_KEY=RESEND_API_KEY:latest,FIREBASE_API_KEY=FIREBASE_API_KEY:latest"
fi

# Fulfillment 027 extends the Migration 025 media contract. The schema prerequisite
# is therefore applied in isolated non-production even when Classifieds feature
# flags remain disabled. Feature exposure and schema presence stay separate.
if [[ "$CLASSIFIEDS_MIGRATION_025_MODE" == 'off' ]]; then
  CLASSIFIEDS_MIGRATION_025_MODE='apply'
  CLASSIFIEDS_MIGRATION_025_CONFIRMATION="APPLY_KHEDMAH_NONPROD_025_${environment^^}"
  echo 'Migration 025 schema is required as the predecessor of fulfillment 026-028; Classifieds feature flags are unchanged.'
fi
export CLASSIFIEDS_MIGRATION_025_MODE CLASSIFIEDS_MIGRATION_025_CONFIRMATION
scripts/deployment/ensure-classifieds-nonproduction-schema.sh "$environment" "$identifier"

# Orders, driver-document review and durable notifications are runtime contracts,
# not optional Preview cosmetics. Apply atomically before building/deploying backend.
FULFILLMENT_MIGRATIONS_026_028_MODE='apply'
FULFILLMENT_MIGRATIONS_026_028_CONFIRMATION="APPLY_KHEDMAH_NONPROD_026_028_${environment^^}"
export FULFILLMENT_MIGRATIONS_026_028_MODE FULFILLMENT_MIGRATIONS_026_028_CONFIRMATION
scripts/deployment/ensure-fulfillment-nonproduction-schema.sh "$environment" "$identifier"

# Taxi pricing history is governed separately from the candidate-only Taxi trip schema.
# Apply the append-only pricing ledger before backend deployment; this does not enable trips.
TAXI_PRICING_MIGRATION_029_MODE='apply'
TAXI_PRICING_MIGRATION_029_CONFIRMATION="APPLY_KHEDMAH_NONPROD_029_${environment^^}"
export TAXI_PRICING_MIGRATION_029_MODE TAXI_PRICING_MIGRATION_029_CONFIRMATION
scripts/deployment/ensure-taxi-pricing-nonproduction-schema.sh "$environment" "$identifier"

# Product V2 Billing is active backend runtime. Its append-only ledger, subscriptions,
# welcome grants and promo contract must exist before the backend can serve Billing APIs.
BILLING_MIGRATION_030_MODE='apply'
BILLING_MIGRATION_030_CONFIRMATION="APPLY_KHEDMAH_NONPROD_030_${environment^^}"
export BILLING_MIGRATION_030_MODE BILLING_MIGRATION_030_CONFIRMATION
scripts/deployment/ensure-billing-nonproduction-schema.sh "$environment" "$identifier"

# Taxi operational authority is intentionally narrower than trip execution. It promotes
# document-reviewed driver/vehicle/zone approvals and actor resolution only. Trips stay off.
TAXI_OPERATIONAL_MIGRATION_031_MODE='apply'
TAXI_OPERATIONAL_MIGRATION_031_CONFIRMATION="APPLY_KHEDMAH_NONPROD_031_${environment^^}"
export TAXI_OPERATIONAL_MIGRATION_031_MODE TAXI_OPERATIONAL_MIGRATION_031_CONFIRMATION
bash scripts/deployment/ensure-taxi-operational-nonproduction-schema.sh "$environment" "$identifier"

# Migration 032 hardens Taxi actor resolution against public/moderation/trust/profile
# state. Canonical schema 034 requires this function contract before backend start.
TAXI_OPERATIONAL_MIGRATION_032_MODE='apply'
TAXI_OPERATIONAL_MIGRATION_032_CONFIRMATION="APPLY_KHEDMAH_NONPROD_032_${environment^^}"
export TAXI_OPERATIONAL_MIGRATION_032_MODE TAXI_OPERATIONAL_MIGRATION_032_CONFIRMATION
bash scripts/deployment/ensure-taxi-operational-profile-gate-nonproduction-schema.sh "$environment" "$identifier"

# Restaurant-funded food promotion pricing is part of the cash-order contract.
# Apply its claim ledger before backend rollout; no payment gateway or platform subsidy is enabled.
FOOD_PROMOTIONS_MIGRATION_034_MODE='apply'
FOOD_PROMOTIONS_MIGRATION_034_CONFIRMATION="APPLY_KHEDMAH_NONPROD_034_${environment^^}"
export FOOD_PROMOTIONS_MIGRATION_034_MODE FOOD_PROMOTIONS_MIGRATION_034_CONFIRMATION
bash scripts/deployment/ensure-food-promotions-nonproduction-schema.sh "$environment" "$identifier"

gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "cloudbuild.${environment}-backend.yaml" \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}"

if [[ "$environment" == "staging" ]]; then
  integrity_job="khedmah-release-data-integrity-staging"
  gcloud run jobs deploy "$integrity_job" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --image "$backend_image" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
    --set-env-vars="NODE_ENV=staging,CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME}" \
    --command=node \
    --args=apps/backend/dist/database/release-data-integrity.cli.js \
    --tasks=1 \
    --parallelism=1 \
    --max-retries=0 \
    --task-timeout=10m \
    --quiet
  gcloud run jobs execute "$integrity_job" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --wait
fi

backend_deploy_args=(
  gcloud run deploy "$backend_service"
  --project "$GOOGLE_CLOUD_PROJECT"
  --region "$GOOGLE_CLOUD_REGION"
  --image "$backend_image"
  --service-account "$RUNTIME_SERVICE_ACCOUNT"
  --set-env-vars="$backend_runtime_env"
  --allow-unauthenticated
  --quiet
)
backend_deploy_args+=(
  --add-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME"
  --set-secrets="$backend_secret_bindings"
)
"${backend_deploy_args[@]}"
backend_url="$(gcloud run services describe "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"

[[ "$backend_url" == https://*run.app ]] || { echo 'Isolated backend URL is not a Cloud Run URL.' >&2; exit 5; }
if [[ "$CLASSIFIEDS_ENABLED" == 'true' ]]; then
  node scripts/deployment/verify-classifieds-backend-smoke.mjs "$backend_url"
fi

gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "$config" \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag},_NEXT_PUBLIC_API_URL=${backend_url},_NEXT_PUBLIC_CLASSIFIEDS_ENABLED=${NEXT_PUBLIC_CLASSIFIEDS_ENABLED}"

gcloud run deploy "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$frontend_image" --service-account "$RUNTIME_SERVICE_ACCOUNT" --set-env-vars="NODE_ENV=${environment},APP_VERSION=${tag},TAXI_TRIPS_ENABLED=${TAXI_TRIPS_ENABLED}" --allow-unauthenticated --quiet
frontend_url="$(gcloud run services describe "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
[[ "$frontend_url" == https://*run.app ]] || { echo 'Isolated frontend URL is not a Cloud Run URL.' >&2; exit 5; }
# The runtime allowlist and action-link origin must match this deployment.
gcloud run services update "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --update-env-vars="CORS_ORIGIN=${frontend_url},NEXT_PUBLIC_SITE_URL=${frontend_url}" --quiet

curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health/ready" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${frontend_url}/" >/dev/null
headers_file="$(mktemp)"
trap 'rm -f "$headers_file"' EXIT
curl --fail --silent --show-error --retry 3 --retry-all-errors --request OPTIONS \
  --header "Origin: ${frontend_url}" --header 'Access-Control-Request-Method: POST' \
  --dump-header "$headers_file" --output /dev/null "${backend_url}/api/v1/auth/session"
node scripts/deployment/verify-cors-preflight.mjs "$headers_file" "$frontend_url"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'backend_url=%s\nfrontend_url=%s\nbackend_service=%s\nfrontend_service=%s\n' "$backend_url" "$frontend_url" "$backend_service" "$frontend_service" >> "$GITHUB_OUTPUT"; fi
echo "${environment^} deployment healthy and ready."
