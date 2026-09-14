#!/usr/bin/env bash
set -euo pipefail

environment="${1:?usage: ensure-billing-nonproduction-schema.sh preview|staging IDENTIFIER}"
identifier="${2:?usage: ensure-billing-nonproduction-schema.sh preview|staging IDENTIFIER}"
mode="${BILLING_MIGRATION_030_MODE:-off}"
readonly migration_sha256='d758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194'
readonly migration_git_blob='88795ee75d9948e5ecf85d8c2d53f6b77397b52b'

[[ "$environment" == 'preview' || "$environment" == 'staging' ]] || { echo 'Only preview or staging Billing schema operations are allowed.' >&2; exit 2; }
[[ "$identifier" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid deployment identifier.' >&2; exit 2; }
[[ "$mode" == 'off' || "$mode" == 'verify' || "$mode" == 'apply' ]] || { echo 'BILLING_MIGRATION_030_MODE must be off, verify, or apply.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION ARTIFACT_REPOSITORY RUNTIME_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE_CONNECTION_NAME PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing Billing schema operation on the production project.' >&2; exit 4; }
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]] || { echo 'Billing schema operation requires the isolated environment Cloud SQL instance.' >&2; exit 4; }
if [[ "$mode" == 'off' ]]; then echo 'Billing migration 030 operation is off.'; exit 0; fi
if [[ "$mode" == 'apply' ]]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_030_${environment^^}"
  [[ "${BILLING_MIGRATION_030_CONFIRMATION:-}" == "$expected_confirmation" ]] || { echo 'Explicit Billing migration 030 confirmation token is missing or invalid.' >&2; exit 4; }
fi

migration='backend/migrations/versions/030_billing_credits_subscriptions.sql'
actual_sha256="$(sha256sum "$migration" | awk '{print $1}')"
[[ "$actual_sha256" == "$migration_sha256" ]] || { echo 'Repository Billing migration checksum changed.' >&2; exit 4; }
actual_git_blob="$(git hash-object "$migration")"
[[ "$actual_git_blob" == "$migration_git_blob" ]] || { echo 'Repository Billing migration Git blob changed.' >&2; exit 4; }

tag="${environment}-${identifier}"
short_identifier="$(printf '%s' "$identifier" | sha256sum | cut -c1-10)"
image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/billing-migration:${tag}"
job="khedmah-${environment}-billing-030-${short_identifier}"

gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config cloudbuild.billing-migration.yaml \
  --substitutions="_REGION=${GOOGLE_CLOUD_REGION},_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_TAG=${tag}" --quiet

gcloud run jobs deploy "$job" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --image "$image" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" --set-secrets='DATABASE_URL=DATABASE_URL:latest' \
  --set-env-vars="DEPLOYMENT_ENVIRONMENT=${environment},GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},PRODUCTION_GOOGLE_CLOUD_PROJECT=${PRODUCTION_GOOGLE_CLOUD_PROJECT},CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME},MIGRATION_MODE=${mode},MIGRATION_CONFIRMATION=${BILLING_MIGRATION_030_CONFIRMATION:-},MIGRATION_SHA256=${migration_sha256},MIGRATION_GIT_BLOB=${migration_git_blob}" \
  --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 10m --quiet

if ! gcloud run jobs execute "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --wait; then
  echo 'BILLING_030_FAILED_EXECUTION' >&2
  echo 'BILLING_030_CONTAINER_LOGS_BEGIN' >&2
  gcloud run jobs executions describe "$(gcloud run jobs executions list --job "$job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(metadata.name)' --limit=1)" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='yaml(status)' >&2 || true
  gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${job}" --project "$GOOGLE_CLOUD_PROJECT" --limit=40 --format='value(textPayload)' >&2 || true
  echo 'BILLING_030_CONTAINER_LOGS_END' >&2
  exit 1
fi

printf 'Billing migration 030 %s completed and verified for %s.\n' "$mode" "$environment"
