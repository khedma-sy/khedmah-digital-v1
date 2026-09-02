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
  [[ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]] || { echo 'Missing CLOUD_SQL_INSTANCE_CONNECTION_NAME for preview.' >&2; exit 3; }
  [[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Preview Cloud SQL instance must belong to the preview project and region.' >&2; exit 4; }
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
backend_runtime_env="NODE_ENV=${environment},APP_VERSION=${tag}"
if [[ "$environment" == "preview" ]]; then
  backend_runtime_env+=",CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME}"
fi

if [[ "$environment" == "preview" ]]; then
  gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config cloudbuild.preview-backend.yaml \
    --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}"
  gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config cloudbuild.migration.yaml \
    --substitutions="COMMIT_SHA=${tag},_REGION=${GOOGLE_CLOUD_REGION},_AR_REPOSITORY=${ARTIFACT_REPOSITORY}"

  migration_image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/database-migrations:${tag}"
  migration_job="khedmah-pr-${pr_number}-migration"
  gcloud run jobs deploy "$migration_job" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --image "$migration_image" \
    --command /usr/local/bin/run-preview-migrations \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
    --set-env-vars="DEPLOYMENT_ENVIRONMENT=preview,EXPECTED_PREVIEW_DATABASE=khedmah_preview" \
    --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 10m --quiet
  if ! gcloud run jobs execute "$migration_job" \
    --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait; then
    echo 'Preview migration failed; printing the bounded migration-job logs.' >&2
    gcloud logging read \
      "resource.type=cloud_run_job AND resource.labels.job_name=${migration_job}" \
      --project "$GOOGLE_CLOUD_PROJECT" --freshness=20m --limit=100 \
      --format='value(timestamp,severity,textPayload,jsonPayload.message)' >&2 || true
    exit 6
  fi
else
  gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "$config" \
    --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}"
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
if [[ "$environment" == "preview" ]]; then
  backend_deploy_args+=(
    --add-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME"
    --set-secrets="DATABASE_URL=DATABASE_URL:latest"
  )
fi
"${backend_deploy_args[@]}"
backend_url="$(gcloud run services describe "$backend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"

if [[ "$environment" == "preview" ]]; then
  [[ "$backend_url" == https://*run.app ]] || { echo 'Preview backend URL is not a Cloud Run URL.' >&2; exit 5; }
  gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "$config" \
    --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag},_NEXT_PUBLIC_API_URL=${backend_url}"
fi

gcloud run deploy "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$frontend_image" --service-account "$RUNTIME_SERVICE_ACCOUNT" --set-env-vars="NODE_ENV=${environment},APP_VERSION=${tag}" --allow-unauthenticated --quiet
frontend_url="$(gcloud run services describe "$frontend_service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${frontend_url}/" >/dev/null
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'backend_url=%s\nfrontend_url=%s\nbackend_service=%s\nfrontend_service=%s\n' "$backend_url" "$frontend_url" "$backend_service" "$frontend_service" >> "$GITHUB_OUTPUT"; fi
echo "${environment^} deployment healthy."
