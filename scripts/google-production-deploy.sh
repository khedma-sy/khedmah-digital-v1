#!/usr/bin/env bash
set -euo pipefail
set +x

: "${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"

[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || {
  echo 'OPERATIONS_APPROVED_PRODUCTION=true is required.' >&2
  exit 5
}

for name in \
  GOOGLE_CLOUD_PROJECT \
  PRODUCTION_GOOGLE_CLOUD_PROJECT \
  GOOGLE_CLOUD_REGION \
  OPERATIONS_DEPLOYER_SERVICE_ACCOUNT \
  OPERATIONS_ARTIFACT_REPOSITORY \
  OPERATIONS_BACKEND_SERVICE \
  OPERATIONS_FRONTEND_SERVICE \
  OPERATIONS_RUNTIME_SERVICE_ACCOUNT \
  OPERATIONS_BUILD_SERVICE_ACCOUNT \
  CLOUD_SQL_INSTANCE_CONNECTION_NAME \
  GCS_MEDIA_BUCKET \
  CORS_ORIGIN \
  NEXT_PUBLIC_SITE_URL \
  EMAIL_FROM \
  GOOGLE_LOGGING_ENABLED \
  GOOGLE_MONITORING_ENABLED \
  GOOGLE_ERROR_REPORTING_ENABLED \
  CLASSIFIEDS_ENABLED \
  NEXT_PUBLIC_CLASSIFIEDS_ENABLED; do
  [[ -n "${!name:-}" ]] || { echo "Missing ${name}." >&2; exit 4; }
done

[[ "$GOOGLE_CLOUD_PROJECT" == "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || {
  echo 'Refusing Production deployment because GOOGLE_CLOUD_PROJECT does not match PRODUCTION_GOOGLE_CLOUD_PROJECT.' >&2
  exit 6
}

legacy_project="project-""94512a0e-1a5e-4bdb-87f"
legacy_number="774201""339973"
for value in \
  "$GOOGLE_CLOUD_PROJECT" \
  "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" \
  "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" \
  "$OPERATIONS_BUILD_SERVICE_ACCOUNT" \
  "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  "$GCS_MEDIA_BUCKET" \
  "$CORS_ORIGIN" \
  "$NEXT_PUBLIC_SITE_URL"; do
  if [[ "$value" == *"$legacy_project"* || "$value" == *"$legacy_number"* ]]; then
    echo 'Refusing Production deployment because a legacy Google project binding remains.' >&2
    exit 6
  fi
done

[[ "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo 'Runtime service account must belong to the active Production project.' >&2
  exit 6
}
[[ "$OPERATIONS_BUILD_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo 'Build service account must belong to the active Production project.' >&2
  exit 6
}
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || {
  echo 'Cloud SQL connection must belong to the active Production project and region.' >&2
  exit 6
}
for telemetry_name in GOOGLE_LOGGING_ENABLED GOOGLE_MONITORING_ENABLED GOOGLE_ERROR_REPORTING_ENABLED; do
  [[ "${!telemetry_name}" == "true" ]] || {
    echo "${telemetry_name} must be true for Production deployment." >&2
    exit 6
  }
done
for classifieds_flag in CLASSIFIEDS_ENABLED NEXT_PUBLIC_CLASSIFIEDS_ENABLED; do
  [[ "${!classifieds_flag}" == "true" || "${!classifieds_flag}" == "false" ]] || {
    echo "${classifieds_flag} must be true or false." >&2
    exit 6
  }
done
[[ "$NEXT_PUBLIC_CLASSIFIEDS_ENABLED" != "true" || "$CLASSIFIEDS_ENABLED" == "true" ]] || {
  echo 'Frontend Classifieds cannot be enabled while Backend Classifieds is disabled.' >&2
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
ALLOW_FIRST_PRODUCTION_DEPLOY=true bash scripts/validate-production-deployment-readiness.sh

BUILD_SERVICE_ACCOUNT="projects/${GOOGLE_CLOUD_PROJECT}/serviceAccounts/${OPERATIONS_BUILD_SERVICE_ACCOUNT}"

SOURCE_STAGING_DIR="gs://${GOOGLE_CLOUD_PROJECT}-cloudbuild-source/source"
FACEBOOK_AUTH_ENABLED="${FACEBOOK_AUTH_ENABLED:-false}"

gcloud builds submit . \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --service-account "$BUILD_SERVICE_ACCOUNT" \
  --gcs-source-staging-dir "$SOURCE_STAGING_DIR" \
  --config cloudbuild.production-new-account.yaml \
  --substitutions "COMMIT_SHA=${COMMIT_SHA},_REGION=${GOOGLE_CLOUD_REGION},_AR_REPOSITORY=${OPERATIONS_ARTIFACT_REPOSITORY},_BACKEND_SERVICE=${OPERATIONS_BACKEND_SERVICE},_FRONTEND_SERVICE=${OPERATIONS_FRONTEND_SERVICE},_RUNTIME_SERVICE_ACCOUNT=${OPERATIONS_RUNTIME_SERVICE_ACCOUNT},_CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},_GCS_MEDIA_BUCKET=${GCS_MEDIA_BUCKET},_CORS_ORIGIN=${CORS_ORIGIN},_SITE_URL=${NEXT_PUBLIC_SITE_URL},_EMAIL_FROM=${EMAIL_FROM},_GOOGLE_LOGGING_ENABLED=${GOOGLE_LOGGING_ENABLED},_GOOGLE_MONITORING_ENABLED=${GOOGLE_MONITORING_ENABLED},_GOOGLE_ERROR_REPORTING_ENABLED=${GOOGLE_ERROR_REPORTING_ENABLED},_FACEBOOK_AUTH_ENABLED=${FACEBOOK_AUTH_ENABLED},_CLASSIFIEDS_ENABLED=${CLASSIFIEDS_ENABLED},_NEXT_PUBLIC_CLASSIFIEDS_ENABLED=${NEXT_PUBLIC_CLASSIFIEDS_ENABLED}" \
  --quiet
