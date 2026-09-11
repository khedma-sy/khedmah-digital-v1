#!/usr/bin/env bash
set -euo pipefail

required=(
  GCP_WORKLOAD_IDENTITY_PROVIDER
  GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT
  GCP_STAGING_RUNTIME_SERVICE_ACCOUNT
  DEVELOPMENT_GOOGLE_CLOUD_PROJECT
  PREVIEW_GOOGLE_CLOUD_PROJECT
  STAGING_GOOGLE_CLOUD_PROJECT
  STAGING_GOOGLE_CLOUD_PROJECT_NUMBER
  PRODUCTION_GOOGLE_CLOUD_PROJECT
  DEVELOPMENT_FIREBASE_PROJECT_ID
  PREVIEW_FIREBASE_PROJECT_ID
  STAGING_FIREBASE_PROJECT_ID
  PRODUCTION_FIREBASE_PROJECT_ID
  GOOGLE_CLOUD_REGION
  STAGING_ARTIFACT_REPOSITORY
  STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME
  STAGING_GCS_MEDIA_BUCKET
  STAGING_EMAIL_FROM
)

missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if ((${#missing[@]})); then
  joined="$(IFS=,; echo "${missing[*]}")"
  echo "::error::Missing protected staging environment configuration: ${joined}" >&2
  exit 2
fi

assert_unique() {
  local family="$1"
  shift
  local -A seen=()
  local value
  for value in "$@"; do
    if [[ -n "${seen[$value]:-}" ]]; then
      echo "::error::${family} identities must be unique across development, preview, staging, and production before GCP authentication." >&2
      exit 2
    fi
    seen[$value]=1
  done
}

assert_unique GOOGLE_CLOUD_PROJECT \
  "$DEVELOPMENT_GOOGLE_CLOUD_PROJECT" \
  "$PREVIEW_GOOGLE_CLOUD_PROJECT" \
  "$STAGING_GOOGLE_CLOUD_PROJECT" \
  "$PRODUCTION_GOOGLE_CLOUD_PROJECT"
assert_unique FIREBASE_PROJECT_ID \
  "$DEVELOPMENT_FIREBASE_PROJECT_ID" \
  "$PREVIEW_FIREBASE_PROJECT_ID" \
  "$STAGING_FIREBASE_PROJECT_ID" \
  "$PRODUCTION_FIREBASE_PROJECT_ID"

if [[ ! "$STAGING_GOOGLE_CLOUD_PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo '::error::STAGING_GOOGLE_CLOUD_PROJECT_NUMBER must be a numeric Google Cloud project number.' >&2
  exit 2
fi

if [[ "$GCP_WORKLOAD_IDENTITY_PROVIDER" =~ ^projects/([0-9]+)/locations/global/workloadIdentityPools/([^/]+)/providers/([^/]+)$ ]]; then
  provider_project_number="${BASH_REMATCH[1]}"
else
  echo '::error::GCP_WORKLOAD_IDENTITY_PROVIDER is not a canonical Workload Identity Provider resource name.' >&2
  exit 2
fi

if [[ "$provider_project_number" != "$STAGING_GOOGLE_CLOUD_PROJECT_NUMBER" ]]; then
  echo '::error::GCP_WORKLOAD_IDENTITY_PROVIDER must belong to STAGING_GOOGLE_CLOUD_PROJECT_NUMBER; Preview or Production WIF providers are not accepted.' >&2
  exit 2
fi

expected_sa_suffix="@${STAGING_GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
for name in GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT GCP_STAGING_RUNTIME_SERVICE_ACCOUNT; do
  value="${!name}"
  if [[ "$value" != *"${expected_sa_suffix}" ]]; then
    echo "::error::${name} must belong to STAGING_GOOGLE_CLOUD_PROJECT; Preview or Production identities are not accepted." >&2
    exit 2
  fi
done

if [[ "$GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT" == "$GCP_STAGING_RUNTIME_SERVICE_ACCOUNT" ]]; then
  echo '::error::Staging deployer and runtime service accounts must be distinct identities.' >&2
  exit 2
fi

expected_sql_prefix="${STAGING_GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"
if [[ "$STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME" != "${expected_sql_prefix}"* ]]; then
  echo '::error::STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME must belong to the Staging project and configured region.' >&2
  exit 2
fi

if [[ ! "$STAGING_GCS_MEDIA_BUCKET" =~ ^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$ ]]; then
  echo '::error::STAGING_GCS_MEDIA_BUCKET is not a valid Cloud Storage bucket name.' >&2
  exit 2
fi

if [[ ! "$STAGING_EMAIL_FROM" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo '::error::STAGING_EMAIL_FROM must be a valid sender email address.' >&2
  exit 2
fi

echo 'Staging deployment configuration preflight passed.'
