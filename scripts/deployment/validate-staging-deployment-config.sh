#!/usr/bin/env bash
set -euo pipefail

required=(
  GCP_WORKLOAD_IDENTITY_PROVIDER
  GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT
  GCP_STAGING_RUNTIME_SERVICE_ACCOUNT
  DEVELOPMENT_GOOGLE_CLOUD_PROJECT
  PREVIEW_GOOGLE_CLOUD_PROJECT
  STAGING_GOOGLE_CLOUD_PROJECT
  PRODUCTION_GOOGLE_CLOUD_PROJECT
  DEVELOPMENT_FIREBASE_PROJECT_ID
  PREVIEW_FIREBASE_PROJECT_ID
  STAGING_FIREBASE_PROJECT_ID
  PRODUCTION_FIREBASE_PROJECT_ID
  GOOGLE_CLOUD_REGION
  STAGING_ARTIFACT_REPOSITORY
  STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME
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

case "$GCP_WORKLOAD_IDENTITY_PROVIDER" in
  projects/*/locations/global/workloadIdentityPools/*/providers/*) ;;
  *)
    echo '::error::GCP_WORKLOAD_IDENTITY_PROVIDER is not a canonical Workload Identity Provider resource name.' >&2
    exit 2
    ;;
esac

for name in GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT GCP_STAGING_RUNTIME_SERVICE_ACCOUNT; do
  value="${!name}"
  if [[ "$value" != *@*.iam.gserviceaccount.com ]]; then
    echo "::error::${name} must be a Google service-account email." >&2
    exit 2
  fi
done

echo 'Staging deployment configuration preflight passed.'
