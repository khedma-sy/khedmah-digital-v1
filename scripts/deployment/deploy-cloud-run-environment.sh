#!/usr/bin/env bash
set -euo pipefail
environment="${1:?usage: deploy-cloud-run-environment.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: deploy-cloud-run-environment.sh preview|staging IDENTIFIER}"
[[ "$environment" == "preview" || "$environment" == "staging" ]] || { echo 'Only preview or staging deployment is allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT PRODUCTION_GOOGLE_CLOUD_PROJECT; do [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }; done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing to deploy to the production project.' >&2; exit 4; }
tag="${environment}-${identifier}"
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
gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "$config" \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}"
backend_image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/backend:${tag}"
frontend_image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/frontend:${tag}"
gcloud run deploy "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$backend_image" --service-account "$RUNTIME_SERVICE_ACCOUNT" --set-env-vars="NODE_ENV=${environment},APP_VERSION=${tag}" --allow-unauthenticated --quiet
gcloud run deploy "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$frontend_image" --service-account "$RUNTIME_SERVICE_ACCOUNT" --set-env-vars="NODE_ENV=${environment},APP_VERSION=${tag}" --allow-unauthenticated --quiet
backend_url="$(gcloud run services describe "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
frontend_url="$(gcloud run services describe "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${frontend_url}/" >/dev/null
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'backend_url=%s\nfrontend_url=%s\nbackend_service=%s\nfrontend_service=%s\n' "$backend_url" "$frontend_url" "$backend_service" "$frontend_service" >> "$GITHUB_OUTPUT"; fi
echo "${environment^} deployment healthy."
