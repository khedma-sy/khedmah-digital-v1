#!/usr/bin/env bash
# Source from schema helpers. This selects execution identities; it grants no IAM.
resolve_schema_execution() {
  local environment="${1:?environment required}"
  SCHEMA_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:?runtime identity required}"
  SCHEMA_DATABASE_SECRET_BINDING='DATABASE_URL=DATABASE_URL:latest'
  SCHEMA_BUILD_ARGS=()

  if [[ "${GOOGLE_CLOUD_PROJECT:-}" == 'khedmah-preview-v2-20261012' ]]; then
    if [[ "$environment" != 'preview' \
       || "${GOOGLE_CLOUD_REGION:-}" != 'europe-west1' \
       || "${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}" != 'khedma-dl' \
       || "${ARTIFACT_REPOSITORY:-}" != 'khedmah-preview' \
       || "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" != 'khedmah-preview-v2-20261012:europe-west1:khedmah-preview-v2-db' \
       || "$RUNTIME_SERVICE_ACCOUNT" != 'khedmah-pv2-runtime@khedmah-preview-v2-20261012.iam.gserviceaccount.com' ]]; then
      echo 'SCHEMA_PREVIEW_V2_IDENTITY_MISMATCH' >&2
      return 4
    fi
    SCHEMA_SERVICE_ACCOUNT='khedmah-pv2-migrator@khedmah-preview-v2-20261012.iam.gserviceaccount.com'
    # Expose the migration credential under the runners' existing variable name.
    # Version 1 was verified by the owner on 2026-10-12; no mutable latest alias.
    SCHEMA_DATABASE_SECRET_BINDING='DATABASE_URL=DATABASE_MIGRATION_URL:1'
    SCHEMA_BUILD_ARGS=(
      --service-account 'projects/khedmah-preview-v2-20261012/serviceAccounts/khedmah-pv2-build@khedmah-preview-v2-20261012.iam.gserviceaccount.com'
      --gcs-source-staging-dir 'gs://khedmah-preview-v2-20261012-cloudbuild-source/source'
    )
  fi
}
