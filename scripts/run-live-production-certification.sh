#!/usr/bin/env bash
set -euo pipefail
set +x

[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || {
  echo 'OPERATIONS_APPROVED_PRODUCTION=true is required.' >&2
  exit 5
}
for name in \
  GOOGLE_CLOUD_PROJECT \
  PRODUCTION_GOOGLE_CLOUD_PROJECT \
  GOOGLE_CLOUD_REGION \
  OPERATIONS_BACKEND_SERVICE \
  OPERATIONS_FRONTEND_SERVICE; do
  [[ -n "${!name:-}" ]] || { echo "Missing ${name}." >&2; exit 4; }
done
[[ "$GOOGLE_CLOUD_PROJECT" == "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || {
  echo 'Live Production certification is bound to the explicit Production project.' >&2
  exit 6
}
for command_name in gcloud node; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing required command: ${command_name}." >&2; exit 3; }
done

evidence_root="${OPERATIONS_EVIDENCE_DIRECTORY:-artifacts/live-certification/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$evidence_root" && chmod 700 "$evidence_root"

serving_revision() {
  local service="$1"
  gcloud run services describe "$service" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --format=json | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { input += chunk; });
      process.stdin.on("end", () => {
        const service = JSON.parse(input);
        const traffic = (service.status?.traffic ?? []).filter(item => Number(item.percent ?? 0) > 0);
        if (traffic.length !== 1 || Number(traffic[0].percent) !== 100 || !traffic[0].revisionName) {
          console.error("Live certification requires one explicit revision serving 100% traffic.");
          process.exit(6);
        }
        process.stdout.write(traffic[0].revisionName);
      });
    '
}

before_backend="$(serving_revision "$OPERATIONS_BACKEND_SERVICE")"
before_frontend="$(serving_revision "$OPERATIONS_FRONTEND_SERVICE")"
printf '{"startedAt":"%s","backendRevision":"%s","frontendRevision":"%s"}\n' \
  "$(date -u +%FT%TZ)" "$before_backend" "$before_frontend" > "$evidence_root/before.json"

deployment_changed=false
certification_complete=false
emergency_restore() {
  local rc=$?
  trap - ERR
  set +e
  if [[ "$deployment_changed" == 'true' && "$certification_complete" != 'true' ]]; then
    echo 'Live certification failed after changing Production; restoring the previously serving revision pair.' >&2
    scripts/google-production-rollback.sh "$before_backend" "$before_frontend" \
      > "$evidence_root/emergency-restore.txt" 2>&1 || echo 'WARNING: emergency Production restore failed and requires immediate operator intervention.' >&2
  fi
  exit "$rc"
}
trap emergency_restore ERR

start=$SECONDS
scripts/google-production-deploy.sh 2>&1 | tee "$evidence_root/deploy.log"
deploy_seconds=$((SECONDS-start))
deployment_changed=true

after_backend="$(serving_revision "$OPERATIONS_BACKEND_SERVICE")"
after_frontend="$(serving_revision "$OPERATIONS_FRONTEND_SERVICE")"
[[ "$after_backend" != "$before_backend" && "$after_frontend" != "$before_frontend" ]] || {
  echo 'Deployment did not create and serve both expected new revisions.' >&2
  false
}

start=$SECONDS
scripts/google-production-rollback.sh "$before_backend" "$before_frontend" > "$evidence_root/rollback.txt"
rollback_seconds=$((SECONDS-start))
deployment_changed=false

start=$SECONDS
scripts/google-production-rollback.sh "$after_backend" "$after_frontend" > "$evidence_root/redeploy.txt"
redeploy_seconds=$((SECONDS-start))
deployment_changed=true

scripts/collect-live-production-evidence.sh "$evidence_root/runtime"
printf '{"completedAt":"%s","deploySeconds":%d,"rollbackSeconds":%d,"redeploySeconds":%d,"status":"completed"}\n' \
  "$(date -u +%FT%TZ)" "$deploy_seconds" "$rollback_seconds" "$redeploy_seconds" > "$evidence_root/execution-summary.json"

certification_complete=true
trap - ERR
echo "Certification execution complete. Evidence: $evidence_root"
