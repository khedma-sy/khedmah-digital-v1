#!/usr/bin/env bash
set -euo pipefail
pr_number="${1:?usage: cleanup-preview.sh PR_NUMBER}"
[[ "$pr_number" =~ ^[0-9]+$ ]] || { echo 'PR number must be numeric.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION PRODUCTION_GOOGLE_CLOUD_PROJECT; do [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }; done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing cleanup in production.' >&2; exit 4; }
for component in backend frontend; do
  service="khedmah-pr-${pr_number}-${component}"
  existing="$(gcloud run services list --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --filter="metadata.name=${service}" --format='value(metadata.name)')"
  if [[ "$existing" == "$service" ]]; then
    gcloud run services delete "$service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --quiet
  fi
done
migration_job="khedmah-pr-${pr_number}-migration"
existing_job="$(gcloud run jobs list --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --filter="metadata.name=${migration_job}" --format='value(metadata.name)')"
if [[ "$existing_job" == "$migration_job" ]]; then
  gcloud run jobs delete "$migration_job" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --quiet
fi
echo "Preview resources for PR ${pr_number} removed."
