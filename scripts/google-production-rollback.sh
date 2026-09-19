#!/usr/bin/env bash
set -euo pipefail
set +x

backend_revision="${1:?usage: google-production-rollback.sh BACKEND_REVISION FRONTEND_REVISION}"
frontend_revision="${2:?usage: google-production-rollback.sh BACKEND_REVISION FRONTEND_REVISION}"

[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || {
  echo 'OPERATIONS_APPROVED_PRODUCTION=true is required.' >&2
  exit 3
}

for name in \
  GOOGLE_CLOUD_PROJECT \
  PRODUCTION_GOOGLE_CLOUD_PROJECT \
  GOOGLE_CLOUD_REGION \
  OPERATIONS_BACKEND_SERVICE \
  OPERATIONS_FRONTEND_SERVICE; do
  [[ -n "${!name:-}" ]] || { echo "Missing ${name}." >&2; exit 3; }
done

[[ "$GOOGLE_CLOUD_PROJECT" == "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || {
  echo 'Refusing Production rollback because GOOGLE_CLOUD_PROJECT does not match PRODUCTION_GOOGLE_CLOUD_PROJECT.' >&2
  exit 4
}

for value in "$OPERATIONS_BACKEND_SERVICE" "$OPERATIONS_FRONTEND_SERVICE" "$backend_revision" "$frontend_revision"; do
  [[ "$value" =~ ^[a-z][a-z0-9-]{1,62}$ ]] || { echo 'Invalid Cloud Run service or revision name.' >&2; exit 2; }
done

[[ "$backend_revision" == "$OPERATIONS_BACKEND_SERVICE-"* ]] || {
  echo 'Backend revision does not belong to the configured Production backend service.' >&2
  exit 4
}
[[ "$frontend_revision" == "$OPERATIONS_FRONTEND_SERVICE-"* ]] || {
  echo 'Frontend revision does not belong to the configured Production frontend service.' >&2
  exit 4
}

command -v gcloud >/dev/null 2>&1 || { echo 'gcloud is required.' >&2; exit 3; }
command -v curl >/dev/null 2>&1 || { echo 'curl is required.' >&2; exit 3; }

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
          console.error("Production revision switch requires one explicit revision serving 100% traffic before proceeding.");
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

revision_exists_for_service "$OPERATIONS_BACKEND_SERVICE" "$backend_revision" || {
  echo 'Requested backend revision was not found on the configured Production backend service.' >&2
  exit 5
}
revision_exists_for_service "$OPERATIONS_FRONTEND_SERVICE" "$frontend_revision" || {
  echo 'Requested frontend revision was not found on the configured Production frontend service.' >&2
  exit 5
}

previous_backend_revision="$(single_serving_revision "$OPERATIONS_BACKEND_SERVICE")"
previous_frontend_revision="$(single_serving_revision "$OPERATIONS_FRONTEND_SERVICE")"
backend_changed=false
frontend_changed=false

compensate_partial_switch() {
  local rc=$?
  trap - ERR
  set +e
  echo 'Production revision switch did not complete safely; restoring the previously serving revisions.' >&2
  if [[ "$frontend_changed" == 'true' ]]; then
    gcloud run services update-traffic "$OPERATIONS_FRONTEND_SERVICE" \
      --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
      --to-revisions "$previous_frontend_revision=100" --quiet || echo 'WARNING: frontend compensation failed.' >&2
  fi
  if [[ "$backend_changed" == 'true' ]]; then
    gcloud run services update-traffic "$OPERATIONS_BACKEND_SERVICE" \
      --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
      --to-revisions "$previous_backend_revision=100" --quiet || echo 'WARNING: backend compensation failed.' >&2
  fi
  exit "$rc"
}
trap compensate_partial_switch ERR

gcloud run services update-traffic "$OPERATIONS_BACKEND_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --to-revisions "$backend_revision=100" --quiet
backend_changed=true

gcloud run services update-traffic "$OPERATIONS_FRONTEND_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --to-revisions "$frontend_revision=100" --quiet
frontend_changed=true

actual_backend_revision="$(single_serving_revision "$OPERATIONS_BACKEND_SERVICE")"
actual_frontend_revision="$(single_serving_revision "$OPERATIONS_FRONTEND_SERVICE")"
[[ "$actual_backend_revision" == "$backend_revision" ]] || { echo 'Backend traffic did not converge to the requested Production revision.' >&2; false; }
[[ "$actual_frontend_revision" == "$frontend_revision" ]] || { echo 'Frontend traffic did not converge to the requested Production revision.' >&2; false; }

backend_url="$(service_url "$OPERATIONS_BACKEND_SERVICE")"
frontend_url="$(service_url "$OPERATIONS_FRONTEND_SERVICE")"
[[ "$backend_url" == https://* ]] || { echo 'Production backend URL is not HTTPS.' >&2; false; }
[[ "$frontend_url" == https://* ]] || { echo 'Production frontend URL is not HTTPS.' >&2; false; }

curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${backend_url}/api/v1/health/ready" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors "${frontend_url}/" >/dev/null

trap - ERR
backend_changed=false
frontend_changed=false

echo "Production revision switch verified: backend=${backend_revision}, frontend=${frontend_revision}."
echo 'Database state was not rolled back; schema/data rollback requires its separate governed procedure.'
