#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-approval-prerequisites-035-037-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-approval-prerequisites-035-037-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${APPROVAL_PREREQUISITES_MIGRATIONS_035_037_MODE:-off}"
readonly migration_035_sha256='e21bcbb1da547ca56aa290a1f89023e6c3692d5f1d27e99675e1d481021de693'
readonly migration_035_git_blob='5fc48b6ad31e5f0033b277b650996dcacd2d554f'
readonly migration_037_sha256='2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216'
readonly migration_037_git_blob='71f86e7c500adfdcd4ca3f2fe8a3562f66374874'
readonly canonical_production_project='khedma-dl'

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging approval prerequisite schema operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
[[ "$mode" == 'off' || "$mode" == 'verify' || "$mode" == 'apply' ]] || { echo 'APPROVAL_PREREQUISITES_MIGRATIONS_035_037_MODE must be off, verify, or apply.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$PRODUCTION_GOOGLE_CLOUD_PROJECT" == "$canonical_production_project" ]] || { echo 'Canonical production project identity is missing or invalid.' >&2; exit 4; }
[[ "$GOOGLE_CLOUD_PROJECT" != "$canonical_production_project" && "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing approval prerequisite schema operation on the production project.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Approval prerequisite schema operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }
if [[ "$mode" == 'off' ]]; then echo 'Approval prerequisite migrations 035 and 037 operation is off.'; exit 0; fi
if [[ "$mode" == 'apply' ]]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_035_037_${environment^^}"
  [[ "${APPROVAL_PREREQUISITES_MIGRATIONS_035_037_CONFIRMATION:-}" == "$expected_confirmation" ]] || { echo 'Explicit approval prerequisite migration confirmation token is missing or invalid.' >&2; exit 4; }
fi
if [[ "$environment" == 'staging' ]]; then
  for name in STAGING_MIGRATION_SERVICE_ACCOUNT STAGING_DATABASE_MIGRATION_SECRET_VERSION; do
    [[ -n "${!name:-}" ]] || { echo "Missing $name; Staging migration identity is not configured." >&2; exit 4; }
  done
  [[ "$STAGING_MIGRATION_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || { echo 'Staging migration service account must belong to the Staging project.' >&2; exit 4; }
  [[ "$STAGING_MIGRATION_SERVICE_ACCOUNT" != "$RUNTIME_SERVICE_ACCOUNT" ]] || { echo 'Staging migration and runtime service accounts must be distinct.' >&2; exit 4; }
  [[ "$STAGING_DATABASE_MIGRATION_SECRET_VERSION" =~ ^[1-9][0-9]*$ ]] || { echo 'Staging database migration secret version must be a pinned positive integer.' >&2; exit 4; }
fi

migration_035='backend/migrations/versions/035_specialized_admin_roles.sql'
migration_037='backend/migrations/versions/037_verification_evidence_media.sql'
[[ "$(sha256sum "$migration_035" | awk '{print $1}')" == "$migration_035_sha256" ]] || { echo 'Repository migration 035 checksum changed.' >&2; exit 4; }
[[ "$(git hash-object "$migration_035")" == "$migration_035_git_blob" ]] || { echo 'Repository migration 035 Git blob changed.' >&2; exit 4; }
[[ "$(sha256sum "$migration_037" | awk '{print $1}')" == "$migration_037_sha256" ]] || { echo 'Repository migration 037 checksum changed.' >&2; exit 4; }
[[ "$(git hash-object "$migration_037")" == "$migration_037_git_blob" ]] || { echo 'Repository migration 037 Git blob changed.' >&2; exit 4; }

source "$(dirname "${BASH_SOURCE[0]}")/schema-execution-profile.sh"
resolve_schema_execution "$environment" "$mode"
if [[ "$environment" == 'staging' ]]; then
  SCHEMA_SERVICE_ACCOUNT="$STAGING_MIGRATION_SERVICE_ACCOUNT"
  SCHEMA_DATABASE_SECRET_BINDING="DATABASE_URL=DATABASE_MIGRATION_URL:${STAGING_DATABASE_MIGRATION_SECRET_VERSION}"
fi

tag="${environment}-${identifier}"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/approval-prerequisites-migration:${tag}"
job="$(node scripts/deployment/preview-schema-job-pool.mjs name "$environment" "$identifier" approval-prerequisites-035-037)"
pool_label_args=()
if [[ "$environment" == 'preview' ]]; then
  pool_label_args=(--labels='khedmah-schema-pool=bounded-v1,khedmah-schema-stage=approval-prerequisites-035-037')
fi

gcloud builds submit . "${SCHEMA_BUILD_ARGS[@]}" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config cloudbuild.approval-prerequisites-migration.yaml \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" --quiet

node scripts/deployment/preview-schema-job-pool.mjs before-deploy "$environment" "$identifier" approval-prerequisites-035-037

gcloud run jobs deploy "$job" "${pool_label_args[@]}" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$image" --service-account "$SCHEMA_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" --set-secrets="$SCHEMA_DATABASE_SECRET_BINDING" \
  --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_REGION=${GOOGLE_CLOUD_REGION},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_CONFIRMATION=${APPROVAL_PREREQUISITES_MIGRATIONS_035_037_CONFIRMATION:-},MIGRATION_035_SHA256=${migration_035_sha256},MIGRATION_037_SHA256=${migration_037_sha256}" \
  --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 10m --quiet

node scripts/deployment/preview-schema-job-pool.mjs before-execute "$environment" "$identifier" approval-prerequisites-035-037

set +e
execution_output="$(gcloud run jobs execute "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait 2>&1)"
execution_status=$?
set -e
printf '%s\n' "$execution_output"
if [[ "$execution_status" -ne 0 ]]; then
  echo 'Approval prerequisite migrations 035 and 037 execution failed; collecting bounded non-production diagnostics.' >&2
  execution_name="$(gcloud run jobs executions list --job "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(metadata.name)' --limit=1 2>/dev/null || true)"
  if [[ -n "$execution_name" ]]; then
    printf 'APPROVAL_PREREQUISITES_035_037_FAILED_EXECUTION=%s\n' "$execution_name" >&2
    gcloud run jobs executions describe "$execution_name" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
      --format='yaml(metadata.name,status.conditions,status.failedCount,status.succeededCount,status.startTime,status.completionTime,status.logUri)' >&2 || true
  fi
  echo 'APPROVAL_PREREQUISITES_035_037_CONTAINER_LOGS_BEGIN' >&2
  gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${job}\"" \
    --project "$GOOGLE_CLOUD_PROJECT" --freshness=30m --limit=200 --order=asc \
    --format='value(timestamp,severity,textPayload,jsonPayload.message)' >&2 || true
  echo 'APPROVAL_PREREQUISITES_035_037_CONTAINER_LOGS_END' >&2
  exit "$execution_status"
fi

printf 'Approval prerequisite migrations 035 and 037 %s completed and verified for %s.\n' "$mode" "$environment"
