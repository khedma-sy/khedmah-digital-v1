#!/usr/bin/env bash
set -euo pipefail

backend_revision="${1:?usage: rollback-staging.sh BACKEND_REVISION FRONTEND_REVISION}"
frontend_revision="${2:?usage: rollback-staging.sh BACKEND_REVISION FRONTEND_REVISION}"
backend_service='khedmah-backend-staging'
frontend_service='khedmah-frontend-staging'

for value in "$backend_revision" "$frontend_revision"; do
  [[ "$value" =~ ^[a-z][a-z0-9-]{1,62}$ ]] || { echo 'Invalid revision.' >&2; exit 2; }
done
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION PRODUCTION_GOOGLE_CLOUD_PROJECT; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 3; }
done
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing rollback in production.' >&2; exit 4; }
[[ "$backend_revision" == "$backend_service-"* ]] || { echo 'Backend revision does not belong to the Staging backend service.' >&2; exit 4; }
[[ "$frontend_revision" == "$frontend_service-"* ]] || { echo 'Frontend revision does not belong to the Staging frontend service.' >&2; exit 4; }

revision_exists_for_service() {
  local service="$1" revision="$2" found
  found="$(gcloud run revisions list \
    --service "$service" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --filter="metadata.name=${revision}" \
    --format='value(metadata.name)' \
    --limit=1)"
  [[ "$found" == "$revision" ]]
}

single_serving_revision() {
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
          console.error("Staging rollback requires one explicit revision serving 100% traffic before proceeding.");
          process.exit(6);
        }
        process.stdout.write(traffic[0].revisionName);
      });
    '
}

service_url() {
  gcloud run services describe "$1" \
    --project "$GOOGLE_CLOUD_PROJECT" \
    --region "$GOOGLE_CLOUD_REGION" \
    --format='value(status.url)'
}

revision_exists_for_service "$backend_service" "$backend_revision" || { echo 'Requested backend revision was not found on the Staging backend service.' >&2; exit 5; }
revision_exists_for_service "$frontend_service" "$frontend_revision" || { echo 'Requested frontend revision was not found on the Staging frontend service.' >&2; exit 5; }

previous_backend_revision="$(single_serving_revision "$backend_service")"
previous_frontend_revision="$(single_serving_revision "$frontend_service")"
backend_changed=false
frontend_changed=false

compensate_partial_rollback() {
  local rc=$?
  trap - ERR
  set +e
  echo 'Staging rollback did not complete safely; restoring the previously serving revisions.' >&2
  if [[ "$frontend_changed" == 'true' ]]; then
    gcloud run services update-traffic "$frontend_service" \
      --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
      --to-revisions "$previous_frontend_revision=100" --quiet || echo 'WARNING: frontend compensation failed.' >&2
  fi
  if [[ "$backend_changed" == 'true' ]]; then
    gcloud run services update-traffic "$backend_service" \
      --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
      --to-revisions "$previous_backend_revision=100" --quiet || echo 'WARNING: backend compensation failed.' >&2
  fi
  exit "$rc"
}
trap compensate_partial_rollback ERR

gcloud run services update-traffic "$backend_service" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --to-revisions "$backend_revision=100" --quiet
backend_changed=true

gcloud run services update-traffic "$frontend_service" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --to-revisions "$frontend_revision=100" --quiet
frontend_changed=true

actual_backend_revision="$(single_serving_revision "$backend_service")"
actual_frontend_revision="$(single_serving_revision "$frontend_service")"
[[ "$actual_backend_revision" == "$backend_revision" ]] || { echo 'Backend traffic did not converge to the requested rollback revision.' >&2; false; }
[[ "$actual_frontend_revision" == "$frontend_revision" ]] || { echo 'Frontend traffic did not converge to the requested rollback revision.' >&2; false; }

backend_url="$(service_url "$backend_service")"
frontend_url="$(service_url "$frontend_service")"
[[ "$backend_url" == https://*run.app ]] || { echo 'Unexpected Staging backend URL.' >&2; false; }
[[ "$frontend_url" == https://*run.app ]] || { echo 'Unexpected Staging frontend URL.' >&2; false; }

curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${frontend_url}/" >/dev/null

trap - ERR
backend_changed=false
frontend_changed=false

echo "Staging rollback verified: backend=${backend_revision}, frontend=${frontend_revision}."
echo 'Database state was not rolled back; schema rollback requires its separate governed procedure.'
