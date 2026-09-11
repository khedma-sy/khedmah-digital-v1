#!/usr/bin/env bash
set -euo pipefail
set +x

[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || {
  echo 'OPERATIONS_APPROVED_PRODUCTION=true is required.' >&2
  exit 5
}

: "${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"

for name in \
  GOOGLE_CLOUD_PROJECT \
  PRODUCTION_GOOGLE_CLOUD_PROJECT \
  GOOGLE_CLOUD_REGION \
  OPERATIONS_DEPLOYER_SERVICE_ACCOUNT \
  OPERATIONS_ARTIFACT_REPOSITORY \
  OPERATIONS_BACKEND_SERVICE \
  OPERATIONS_FRONTEND_SERVICE \
  OPERATIONS_RUNTIME_SERVICE_ACCOUNT \
  CLOUD_SQL_INSTANCE_CONNECTION_NAME \
  GCS_MEDIA_BUCKET; do
  [[ -n "${!name:-}" ]] || { echo "Missing ${name}." >&2; exit 4; }
done

[[ "$GOOGLE_CLOUD_PROJECT" == "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || {
  echo 'Refusing Production deployment because GOOGLE_CLOUD_PROJECT does not match PRODUCTION_GOOGLE_CLOUD_PROJECT.' >&2
  exit 6
}

for command_name in git npm gcloud; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing required command: ${command_name}." >&2; exit 3; }
done

[[ -z "$(git status --porcelain)" ]] || {
  echo 'Production deployment requires a clean Git checkout.' >&2
  exit 7
}

COMMIT_SHA="$(git rev-parse HEAD)"
[[ "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Current Git SHA is invalid.' >&2; exit 7; }
git fetch origin main --quiet
MAIN_SHA="$(git rev-parse origin/main)"
[[ "$COMMIT_SHA" == "$MAIN_SHA" ]] || {
  echo 'Production deployment is locked to the latest origin/main commit.' >&2
  exit 7
}

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
[[ "$ACTIVE_ACCOUNT" == "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" ]] || {
  echo 'The active gcloud account is not the configured Production deployer service account.' >&2
  exit 8
}

gcloud config set project "$GOOGLE_CLOUD_PROJECT" >/dev/null
gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectId)' >/dev/null

npm run validate:google
node scripts/validate-operations-readiness.mjs --production
bash scripts/validate-production-deployment-readiness.sh

BUILD_SERVICE_ACCOUNT="$(gcloud builds get-default-service-account --project "$GOOGLE_CLOUD_PROJECT")"
if [[ "$BUILD_SERVICE_ACCOUNT" != projects/*/serviceAccounts/* ]]; then
  BUILD_SERVICE_ACCOUNT="projects/${GOOGLE_CLOUD_PROJECT}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}"
fi
[[ -n "$BUILD_SERVICE_ACCOUNT" ]] || { echo 'Cloud Build service account is unavailable.' >&2; exit 9; }

SOURCE_STAGING_DIR="gs://${GOOGLE_CLOUD_PROJECT}-cloudbuild-source/source"
FACEBOOK_AUTH_ENABLED="${FACEBOOK_AUTH_ENABLED:-false}"

gcloud builds submit . \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --service-account "$BUILD_SERVICE_ACCOUNT" \
  --gcs-source-staging-dir "$SOURCE_STAGING_DIR" \
  --config cloudbuild.production.yaml \
  --substitutions "COMMIT_SHA=${COMMIT_SHA},_REGION=${GOOGLE_CLOUD_REGION},_AR_REPOSITORY=${OPERATIONS_ARTIFACT_REPOSITORY},_BACKEND_SERVICE=${OPERATIONS_BACKEND_SERVICE},_FRONTEND_SERVICE=${OPERATIONS_FRONTEND_SERVICE},_RUNTIME_SERVICE_ACCOUNT=${OPERATIONS_RUNTIME_SERVICE_ACCOUNT},_CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},_GCS_MEDIA_BUCKET=${GCS_MEDIA_BUCKET},_FACEBOOK_AUTH_ENABLED=${FACEBOOK_AUTH_ENABLED}" \
  --quiet
