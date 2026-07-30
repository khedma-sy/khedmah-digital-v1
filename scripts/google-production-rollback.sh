#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
service="${1:?usage: google-production-rollback.sh SERVICE PREVIOUS_REVISION}"
revision="${2:?usage: google-production-rollback.sh SERVICE PREVIOUS_REVISION}"
[[ "$service" =~ ^[a-z][a-z0-9-]{1,62}$ ]] || { echo 'invalid service name' >&2; exit 2; }
[[ "$revision" =~ ^[a-z][a-z0-9-]{1,62}$ ]] || { echo 'invalid revision name' >&2; exit 2; }
gcloud run services update-traffic "$service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --to-revisions "$revision=100" --quiet
gcloud run services describe "$service" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url,status.latestReadyRevisionName)'
