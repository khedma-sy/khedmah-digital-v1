#!/usr/bin/env bash
set -euo pipefail
[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || { echo 'OPERATIONS_APPROVED_PRODUCTION=true is required' >&2; exit 5; }
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION OPERATIONS_BACKEND_SERVICE OPERATIONS_FRONTEND_SERVICE; do [[ -n "${!name:-}" ]] || { echo "missing $name" >&2; exit 4; }; done
command -v gcloud >/dev/null || { echo 'gcloud is required' >&2; exit 3; }
evidence_root="${OPERATIONS_EVIDENCE_DIRECTORY:-artifacts/live-certification/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$evidence_root" && chmod 700 "$evidence_root"
revision() { gcloud run services describe "$1" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.latestReadyRevisionName)'; }
before_backend="$(revision "$OPERATIONS_BACKEND_SERVICE")"; before_frontend="$(revision "$OPERATIONS_FRONTEND_SERVICE")"
printf '{"startedAt":"%s","backendRevision":"%s","frontendRevision":"%s"}\n' "$(date -u +%FT%TZ)" "$before_backend" "$before_frontend" > "$evidence_root/before.json"
start=$SECONDS
scripts/google-production-deploy.sh 2>&1 | tee "$evidence_root/deploy.log"
deploy_seconds=$((SECONDS-start))
after_backend="$(revision "$OPERATIONS_BACKEND_SERVICE")"; after_frontend="$(revision "$OPERATIONS_FRONTEND_SERVICE")"
[[ "$after_backend" != "$before_backend" && "$after_frontend" != "$before_frontend" ]] || { echo 'deployment did not create both expected revisions' >&2; exit 7; }
start=$SECONDS
scripts/google-production-rollback.sh "$OPERATIONS_BACKEND_SERVICE" "$before_backend" > "$evidence_root/rollback-backend.txt"
scripts/google-production-rollback.sh "$OPERATIONS_FRONTEND_SERVICE" "$before_frontend" > "$evidence_root/rollback-frontend.txt"
rollback_seconds=$((SECONDS-start))
start=$SECONDS
gcloud run services update-traffic "$OPERATIONS_BACKEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --to-revisions "$after_backend=100" --quiet
gcloud run services update-traffic "$OPERATIONS_FRONTEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --to-revisions "$after_frontend=100" --quiet
redeploy_seconds=$((SECONDS-start))
scripts/collect-live-production-evidence.sh "$evidence_root/runtime"
printf '{"completedAt":"%s","deploySeconds":%d,"rollbackSeconds":%d,"redeploySeconds":%d,"status":"completed"}\n' "$(date -u +%FT%TZ)" "$deploy_seconds" "$rollback_seconds" "$redeploy_seconds" > "$evidence_root/execution-summary.json"
echo "Certification execution complete. Evidence: $evidence_root"
