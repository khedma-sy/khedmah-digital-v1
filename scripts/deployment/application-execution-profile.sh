#!/usr/bin/env bash
# Source from the isolated deployment runner. Select existing identities; grant no IAM.
resolve_application_execution() {
  local environment="${1:?environment required}"
  APPLICATION_FRONTEND_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:?runtime identity required}"
  APPLICATION_DATABASE_SECRET_BINDING='DATABASE_URL=DATABASE_URL:latest'
  APPLICATION_MEDIA_BUCKET=''
  APPLICATION_BUILD_ARGS=()
  APPLICATION_FRONTEND_ISOLATION_ARGS=()

  # Preserve Staging's existing execution profile. Every Preview application call
  # must select the replacement target before mail reads, schema work or builds.
  if [[ "$environment" == 'preview' || "${GOOGLE_CLOUD_PROJECT:-}" == 'khedmah-preview-v2-20261012' ]]; then
    if [[ "$environment" != 'preview' || "${GOOGLE_CLOUD_PROJECT:-}" != 'khedmah-preview-v2-20261012' ]]; then
      echo 'APPLICATION_PREVIEW_V2_TARGET_REJECTED' >&2
      return 4
    fi
    source "$(dirname "${BASH_SOURCE[0]}")/schema-execution-profile.sh"
    resolve_schema_execution "$environment" || return
    # The owner verified this bucket and its media/ conditional runtime binding.
    # Select configuration only: actual object access still needs runtime testing.
    APPLICATION_MEDIA_BUCKET='khedmah-preview-v2-20261012.firebasestorage.app'
    if [[ -n "${GCS_MEDIA_BUCKET:-}" && "$GCS_MEDIA_BUCKET" != "$APPLICATION_MEDIA_BUCKET" ]]; then
      echo 'APPLICATION_PREVIEW_V2_MEDIA_BUCKET_REJECTED' >&2
      return 4
    fi
    APPLICATION_FRONTEND_SERVICE_ACCOUNT='khedmah-pv2-frontend@khedmah-preview-v2-20261012.iam.gserviceaccount.com'
    APPLICATION_DATABASE_SECRET_BINDING='DATABASE_URL=DATABASE_URL:1'
    APPLICATION_BUILD_ARGS=("${SCHEMA_BUILD_ARGS[@]}")
    APPLICATION_FRONTEND_ISOLATION_ARGS=(--clear-secrets --clear-cloudsql-instances)
  fi
}
