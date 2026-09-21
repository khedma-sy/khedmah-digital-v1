#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
: "${OPERATIONS_RUNTIME_SERVICE_ACCOUNT:?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_BUILD_SERVICE_ACCOUNT:?OPERATIONS_BUILD_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_MIGRATION_SERVICE_ACCOUNT:?OPERATIONS_MIGRATION_SERVICE_ACCOUNT is required}"

AR_REPOSITORY="${OPERATIONS_ARTIFACT_REPOSITORY:-khedmah-digital}"
BACKEND_SERVICE="${OPERATIONS_BACKEND_SERVICE:-backend}"
FRONTEND_SERVICE="${OPERATIONS_FRONTEND_SERVICE:-frontend}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE_CONNECTION_NAME:?CLOUD_SQL_INSTANCE_CONNECTION_NAME is required}"
SOURCE_BUCKET="${GOOGLE_CLOUD_PROJECT}-cloudbuild-source"

if [[ "$CLOUD_SQL_INSTANCE" != "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]]; then
  echo "ERROR: Cloud SQL connection name is outside the approved project or region." >&2
  exit 1
fi

required_apis=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  identitytoolkit.googleapis.com
  run.googleapis.com
  secretmanager.googleapis.com
  sqladmin.googleapis.com
  storage.googleapis.com
)
enabled_apis="$(gcloud services list --enabled --project "$GOOGLE_CLOUD_PROJECT" --format='value(config.name)')"
for api in "${required_apis[@]}"; do
  grep -F -x -- "$api" <<<"$enabled_apis" >/dev/null || {
    echo "ERROR: Required API is not enabled: $api" >&2
    exit 1
  }
done

[[ "$OPERATIONS_BUILD_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo "ERROR: Build service account is outside the approved project." >&2
  exit 1
}
BUILD_SERVICE_ACCOUNT="$OPERATIONS_BUILD_SERVICE_ACCOUNT"
gcloud iam service-accounts describe "$BUILD_SERVICE_ACCOUNT" --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null
[[ "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo "ERROR: Migration service account is outside the approved project." >&2
  exit 1
}
gcloud iam service-accounts describe "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT" --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null
gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)' >/dev/null
gcloud artifacts repositories describe "$AR_REPOSITORY" \
  --project "$GOOGLE_CLOUD_PROJECT" --location "$GOOGLE_CLOUD_REGION" \
  --format='value(name)' >/dev/null
missing_services=()
for service in "$BACKEND_SERVICE" "$FRONTEND_SERVICE"; do
  if ! gcloud run services describe "$service" \
    --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
    --format='value(metadata.name)' >/dev/null 2>&1; then
    missing_services+=("$service")
  fi
done
if (( ${#missing_services[@]} > 0 )) && [[ "${ALLOW_FIRST_PRODUCTION_DEPLOY:-false}" != "true" ]]; then
  echo "ERROR: Cloud Run services are missing: ${missing_services[*]}" >&2
  exit 1
fi
if (( ${#missing_services[@]} > 0 )); then
  echo "READY: FIRST_DEPLOY_MISSING_SERVICES=${missing_services[*]}"
else
  echo "READY: CLOUD_RUN_SERVICES=${BACKEND_SERVICE},${FRONTEND_SERVICE}"
fi

SQL_INSTANCE_NAME="${CLOUD_SQL_INSTANCE##*:}"
SQL_INSTANCE_REGION="$(gcloud sql instances describe "$SQL_INSTANCE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT" --format='value(region)')"
if [[ "$SQL_INSTANCE_REGION" != "$GOOGLE_CLOUD_REGION" ]]; then
  echo "ERROR: Cloud SQL instance region does not match GOOGLE_CLOUD_REGION." >&2
  exit 1
fi
gcloud iam service-accounts describe "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" \
  --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null

required_secrets=(
  DATABASE_URL
  DATABASE_MIGRATION_URL
  FIREBASE_API_KEY
  FIREBASE_APP_ID
  GOOGLE_MAPS_ANDROID_API_KEY
  GOOGLE_MAPS_BROWSER_API_KEY
  GOOGLE_MAPS_SERVER_API_KEY
  GOOGLE_OAUTH_SERVER_CLIENT_ID
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  OPERATIONS_PRODUCT_ROLE_BINDINGS
  RESEND_API_KEY
)
for secret_name in "${required_secrets[@]}"; do
  state="$(gcloud secrets versions describe latest \
    --secret "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" \
    --format='value(state)')"
  if [[ "$state" != "ENABLED" ]]; then
    echo "ERROR: Secret has no enabled latest version: $secret_name" >&2
    exit 1
  fi
done

echo "READY: DEPLOYMENT_PREREQUISITES=${GOOGLE_CLOUD_PROJECT}/${GOOGLE_CLOUD_REGION}"
echo "READY: CLOUD_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT}"
echo "READY: CLOUD_RUN_SERVICES=${BACKEND_SERVICE},${FRONTEND_SERVICE}"
echo "READY: SECRET_METADATA_COUNT=${#required_secrets[@]}"
