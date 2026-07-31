#!/usr/bin/env bash
set -euo pipefail
backend_revision="${1:?usage: rollback-staging.sh BACKEND_REVISION FRONTEND_REVISION}"
frontend_revision="${2:?usage: rollback-staging.sh BACKEND_REVISION FRONTEND_REVISION}"
for value in "$backend_revision" "$frontend_revision"; do [[ "$value" =~ ^[a-z][a-z0-9-]{1,62}$ ]] || { echo 'Invalid revision.' >&2; exit 2; }; done
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION PRODUCTION_GOOGLE_CLOUD_PROJECT; do [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }; done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing rollback in production.' >&2; exit 4; }
gcloud run services update-traffic khedmah-backend-staging --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --to-revisions "$backend_revision=100" --quiet
gcloud run services update-traffic khedmah-frontend-staging --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --to-revisions "$frontend_revision=100" --quiet
echo 'Staging rollback complete; verify health and runtime monitoring.'
