#!/usr/bin/env bash
set -euo pipefail
set +x

evidence="$EVIDENCE_DIRECTORY/live-validation"
mkdir -p "$evidence"

gcloud run services describe "$OPERATIONS_BACKEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format=json \
  | jq '{name:.metadata.name,latestReadyRevision:.status.latestReadyRevisionName,traffic:.status.traffic}' > "$evidence/backend-service.json"
gcloud run services describe "$OPERATIONS_FRONTEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format=json \
  | jq '{name:.metadata.name,latestReadyRevision:.status.latestReadyRevisionName,traffic:.status.traffic}' > "$evidence/frontend-service.json"
gcloud artifacts repositories describe "$OPERATIONS_ARTIFACT_REPOSITORY" --project "$GOOGLE_CLOUD_PROJECT" --location "$GOOGLE_CLOUD_REGION" --format=json \
  | jq '{name,format,createTime,updateTime}' > "$evidence/artifact-registry.json"

for account in "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"; do
  gcloud iam service-accounts describe "$account" --project "$GOOGLE_CLOUD_PROJECT" --format=json | jq -e '.disabled != true' >/dev/null
  safe_name="${account%%@*}"
  gcloud iam service-accounts keys list --iam-account "$account" --managed-by=user --format=json \
    | jq -e 'length == 0' >/dev/null
  printf '{"account":"%s","enabled":true,"userManagedKeys":0}\n' "$safe_name" > "$evidence/service-account-$safe_name.json"
done

roles="$(gcloud projects get-iam-policy "$GOOGLE_CLOUD_PROJECT" --flatten='bindings[].members' --filter="bindings.members:serviceAccount:${OPERATIONS_DEPLOYER_SERVICE_ACCOUNT}" --format='value(bindings.role)')"
if grep -Eq '^roles/(owner|editor)$' <<<"$roles"; then
  echo 'Production deployer has forbidden Owner or Editor role.' >&2
  exit 30
fi
printf '%s\n' "$roles" | sort -u | jq -Rsc 'split("\n") | map(select(length > 0)) | {deployerRoles:.}' > "$evidence/deployer-role-summary.json"

while IFS= read -r secret_name; do
  [[ "$secret_name" =~ ^[A-Z][A-Z0-9_]+$ ]] || continue
  gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)' >/dev/null
done < <(awk '/^  - [A-Z]/{print $2}' infra/secrets/required-secrets.yaml)

for secret_name in FIREBASE_API_KEY FIREBASE_APP_ID GOOGLE_MAPS_SERVER_API_KEY GOOGLE_OAUTH_SERVER_CLIENT_ID OPERATIONS_PRODUCT_ROLE_BINDINGS; do
  gcloud secrets get-iam-policy "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format=json \
    | jq -e --arg member "serviceAccount:$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" \
      '.bindings[]? | select(.role == "roles/secretmanager.secretAccessor") | .members[]? | select(. == $member)' >/dev/null
done

gcloud builds list --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --limit=1 --format=json \
  | jq '[.[] | {id,status,createTime,finishTime}]' > "$evidence/latest-cloud-build.json"
gcloud logging read 'resource.type="cloud_run_revision"' --project "$GOOGLE_CLOUD_PROJECT" --freshness=1h --limit=1 --format=json \
  | jq '[.[] | {timestamp,severity,resourceType:.resource.type}]' > "$evidence/logging-signal.json"
gcloud alpha monitoring policies list --project "$GOOGLE_CLOUD_PROJECT" --format=json \
  | jq '[.[] | {name,displayName,enabled}]' > "$evidence/alert-policies.json"

echo 'Live production metadata and least-privilege boundaries verified without reading secret values.'
