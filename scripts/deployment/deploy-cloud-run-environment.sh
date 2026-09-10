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
for value in "$CLASSIFIEDS_ENABLED" "$NEXT_PUBLIC_CLASSIFIEDS_ENABLED"; do
  [[ "$value" == 'true' || "$value" == 'false' ]] || { echo 'Classifieds feature flags must be literal true or false.' >&2; exit 2; }
done
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
backend_runtime_env="NODE_ENV=${environment},APP_VERSION=${tag},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},CLASSIFIEDS_ENABLED=${CLASSIFIEDS_ENABLED}"

export CLASSIFIEDS_MIGRATION_025_MODE CLASSIFIEDS_MIGRATION_025_CONFIRMATION
scripts/deployment/ensure-classifieds-nonproduction-schema.sh "$environment" "$identifier"

gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "cloudbuild.${environment}-backend.yaml" \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}"

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
  --set-secrets="DATABASE_URL=DATABASE_URL:latest"
)
"${backend_deploy_args[@]}"
backend_url="$(gcloud run services describe "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"

[[ "$backend_url" == https://*run.app ]] || { echo 'Isolated backend URL is not a Cloud Run URL.' >&2; exit 5; }
gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "$config" \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag},_NEXT_PUBLIC_API_URL=${backend_url},_NEXT_PUBLIC_CLASSIFIEDS_ENABLED=${NEXT_PUBLIC_CLASSIFIEDS_ENABLED}"

gcloud run deploy "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$frontend_image" --service-account "$RUNTIME_SERVICE_ACCOUNT" --set-env-vars="NODE_ENV=${environment},APP_VERSION=${tag}" --allow-unauthenticated --quiet
frontend_url="$(gcloud run services describe "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
[[ "$frontend_url" == https://*run.app ]] || { echo 'Isolated frontend URL is not a Cloud Run URL.' >&2; exit 5; }
# The runtime allowlist must match this deployment, including credentialed requests.
gcloud run services update "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --update-env-vars="CORS_ORIGIN=${frontend_url}" --quiet

curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${frontend_url}/" >/dev/null
headers_file="$(mktemp)"
trap 'rm -f "$headers_file"' EXIT
curl --fail --silent --show-error --retry 3 --retry-all-errors --request OPTIONS \
  --header "Origin: ${frontend_url}" --header 'Access-Control-Request-Method: POST' \
  --dump-header "$headers_file" --output /dev/null "${backend_url}/api/v1/auth/session"
node scripts/deployment/verify-cors-preflight.mjs "$headers_file" "$frontend_url"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'backend_url=%s\nfrontend_url=%s\nbackend_service=%s\nfrontend_service=%s\n' "$backend_url" "$frontend_url" "$backend_service" "$frontend_service" >> "$GITHUB_OUTPUT"; fi
echo "${environment^} deployment healthy."
