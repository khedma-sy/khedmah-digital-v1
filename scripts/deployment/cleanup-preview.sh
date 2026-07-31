#!/usr/bin/env bash
set -euo pipefail
pr_number="${1:?usage: cleanup-preview.sh PR_NUMBER}"
[[ "$pr_number" =~ ^[0-9]+$ ]] || { echo 'PR number must be numeric.' >&2; exit 2; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION PRODUCTION_GOOGLE_CLOUD_PROJECT; do [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }; done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing cleanup in production.' >&2; exit 4; }
for component in backend frontend; do
  gcloud run services delete "khedmah-pr-${pr_number}-${component}" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --quiet 2>/dev/null || true
done
echo "Preview services for PR ${pr_number} removed."
