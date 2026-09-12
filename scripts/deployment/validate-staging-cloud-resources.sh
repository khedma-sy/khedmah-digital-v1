#!/usr/bin/env bash
set -euo pipefail

required=(
  GOOGLE_CLOUD_PROJECT
  GOOGLE_CLOUD_REGION
  ARTIFACT_REPOSITORY
  CLOUD_SQL_INSTANCE_CONNECTION_NAME
  GCS_MEDIA_BUCKET
  PRODUCTION_GOOGLE_CLOUD_PROJECT
)

for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "::error::Missing ${name} for Staging cloud-resource preflight." >&2; exit 2; }
done

[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || {
  echo '::error::Refusing Staging cloud-resource preflight against Production.' >&2
  exit 3
}

expected_sql_prefix="${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${expected_sql_prefix}"* ]] || {
  echo '::error::Staging Cloud SQL connection name is outside the selected project or region.' >&2
  exit 3
}

instance_name="${CLOUD_SQL_INSTANCE_CONNECTION_NAME##*:}"
[[ -n "$instance_name" ]] || { echo '::error::Staging Cloud SQL instance name is missing.' >&2; exit 3; }

required_apis=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  run.googleapis.com
  secretmanager.googleapis.com
  sqladmin.googleapis.com
  storage.googleapis.com
)
for api in "${required_apis[@]}"; do
  state="$(gcloud services list --enabled --filter="config.name=$api" --project "$GOOGLE_CLOUD_PROJECT" --format='value(config.name)' 2>/dev/null || true)"
  if [[ "$state" != "$api" ]]; then
    echo "::error::Required Staging API is not enabled: ${api}" >&2
    exit 4
  fi
done

gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --location "$GOOGLE_CLOUD_REGION" \
  --format='value(name)' >/dev/null 2>&1 || {
    echo '::error::Staging Artifact Registry repository is missing or unreadable.' >&2
    exit 5
  }

actual_connection="$(gcloud sql instances describe "$instance_name" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --format='value(connectionName)' 2>/dev/null || true)"
if [[ "$actual_connection" != "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" ]]; then
  echo '::error::Staging Cloud SQL instance is missing or does not match the protected connection name.' >&2
  exit 6
fi

required_secrets=(
  DATABASE_URL
  OPERATIONS_PRODUCT_ROLE_BINDINGS
  FIREBASE_API_KEY
  RESEND_API_KEY
  GOOGLE_MAPS_BROWSER_API_KEY
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
)
for secret_name in "${required_secrets[@]}"; do
  state="$(gcloud secrets versions describe latest \
    --secret "$secret_name" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --format='value(state)' 2>/dev/null || true)"
  if [[ "$state" != 'ENABLED' ]]; then
    echo "::error::Required Staging secret has no enabled latest version: ${secret_name}" >&2
    exit 7
  fi
done

[[ "$GCS_MEDIA_BUCKET" =~ ^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$ ]] || {
  echo '::error::GCS_MEDIA_BUCKET is not a valid bucket identifier.' >&2
  exit 8
}

# This proves bucket existence/readability only for the authenticated deployer identity.
# Runtime object read/write/delete IAM remains a separate post-deploy acceptance gate.
gcloud storage buckets describe "gs://${GCS_MEDIA_BUCKET}" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --format='value(name)' >/dev/null 2>&1 || {
    echo '::error::Staging GCS media bucket is missing or unreadable by the deployer identity.' >&2
    exit 9
  }

echo 'Staging cloud resource preflight passed: isolated Artifact Registry, Cloud SQL, and GCS media bucket resources are readable by the deployer identity, and required runtime secret versions are enabled without reading secret payloads.'
