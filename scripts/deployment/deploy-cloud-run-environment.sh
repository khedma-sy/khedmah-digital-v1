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
backend_runtime_env="NODE_ENV=${environment},APP_VERSION=${tag},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},CLASSIFIEDS_ENABLED=${CLASSIFIEDS_ENABLED},TAXI_TRIPS_ENABLED=${TAXI_TRIPS_ENABLED}"
backend_secret_bindings="DATABASE_URL=DATABASE_URL:latest"
if [[ "$environment" == "staging" ]]; then
  [[ -n "${GCS_MEDIA_BUCKET:-}" ]] || { echo 'Missing GCS_MEDIA_BUCKET for Staging persistent media.' >&2; exit 3; }
  [[ -n "${EMAIL_FROM:-}" ]] || { echo 'Missing EMAIL_FROM for Staging email delivery.' >&2; exit 3; }
  backend_runtime_env+=",GCS_MEDIA_BUCKET=${GCS_MEDIA_BUCKET},EMAIL_FROM=${EMAIL_FROM}"
  backend_secret_bindings+=",OPERATIONS_PRODUCT_ROLE_BINDINGS=OPERATIONS_PRODUCT_ROLE_BINDINGS:latest,RESEND_API_KEY=RESEND_API_KEY:latest,FIREBASE_API_KEY=FIREBASE_API_KEY:latest"
fi

export CLASSIFIEDS_MIGRATION_025_MODE CLASSIFIEDS_MIGRATION_025_CONFIRMATION
scripts/deployment/ensure-classifieds-nonproduction-schema.sh "$environment" "$identifier"

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
