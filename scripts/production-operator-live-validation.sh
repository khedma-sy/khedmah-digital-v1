#!/usr/bin/env bash
set -euo pipefail
set +x

# Reject stale hosting configuration before any cloud call.
if [[ "${GOOGLE_CLOUD_REGION:-}" != "europe-west1" ]]; then
  echo "ERROR: GOOGLE_CLOUD_REGION must be europe-west1 for approved Production operations." >&2
  exit 64
fi

evidence="$EVIDENCE_DIRECTORY/live-validation"
mkdir -p "$evidence"

gcloud run services describe "$OPERATIONS_BACKEND_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format=json \
  | jq '{name:.metadata.name,latestReadyRevision:.status.latestReadyRevisionName,traffic:.status.traffic}' > "$evidence/backend-service.json"

# Verify effective backend environment bindings without ever printing their values.
# A Secret Manager secret existing is different from a running revision binding it.
gcloud run services describe "$OPERATIONS_BACKEND_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format=json \
  | jq -e '(.spec.template.spec.containers | type) == "array" and
      ([.spec.template.spec.containers[]?.env[]? | select(.name == "BOOTSTRAP_ADMIN_SECRET")] | length == 0)' >/dev/null \
  || { echo 'STOP: BOOTSTRAP_ADMIN_SECRET is still bound to backend runtime (or cannot be verified).' >&2; exit 31; }
# Include tagged revisions because their tagged routes can serve requests.
revisions="$(jq -er '
  .traffic | select(type == "array" and length > 0)
  | map(select((.percent // 0) > 0 or (.tag // "") != ""))
  | select(length > 0 and all(.[]; .revisionName | type == "string" and test("^[a-z][a-z0-9-]+$")))
  | map(.revisionName) | unique[]' "$evidence/backend-service.json")" || exit 31
while IFS= read -r revision; do
  gcloud run revisions describe "$revision" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format=json \
    | jq -e '.spec.containers | type == "array" and length > 0 and
        all(.[]; all(.env[]?; .name != "BOOTSTRAP_ADMIN_SECRET"))' >/dev/null \
    || { echo 'STOP: serving revision bootstrap binding absent status unverified.' >&2; exit 31; }
done <<<"$revisions"
printf '%s\n' 'Production runtime BOOTSTRAP_ADMIN_SECRET binding: ABSENT (values not read).'

# Read-only inspection of actual Production SQL instance; never infer PITR from
# a Dockerfile, Terraform template, a Preview database, or a backup workflow.
: "${OPERATIONS_DATABASE_INSTANCE:?STOP: OPERATIONS_DATABASE_INSTANCE is required for actual Production PITR verification}"
gcloud sql instances describe "$OPERATIONS_DATABASE_INSTANCE" --project "$GOOGLE_CLOUD_PROJECT" --format=json \
  | jq -e '{name,region,state,backupEnabled:.settings.backupConfiguration.enabled,
      pitrEnabled:.settings.backupConfiguration.pointInTimeRecoveryEnabled,
      logDays:.settings.backupConfiguration.transactionLogRetentionDays} 
      | select(.backupEnabled == true and .pitrEnabled == true and (.logDays|tonumber) >= 1)' \
  > "$evidence/production-pitr-policy.json" \
  || { echo 'STOP: Production automated backup/PITR policy not proven. Do not deploy.' >&2; exit 32; }
# A successful backup is NOT a recovery-drill receipt. Only a separately fenced
# isolated restore with owner-approved scope can prove successful recovery.
gcloud sql backups list --project "$GOOGLE_CLOUD_PROJECT" \
  --instance "$OPERATIONS_DATABASE_INSTANCE" --limit=7 --format=json \
  | jq -e '[.[] | select(.status == "SUCCESSFUL")] | length > 0' >/dev/null \
  || { echo 'STOP: No successful Production backup verified in last seven listed backups.' >&2; exit 33; }
printf '%s\n' 'Production PITR configuration and at least one successful backup: VERIFIED (restore drill remains separate).'

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

gcp_secret_names=(
  DATABASE_URL
  RESEND_API_KEY
  BOOTSTRAP_ADMIN_SECRET
  GOOGLE_OAUTH_SERVER_CLIENT_ID
  GOOGLE_MAPS_BROWSER_API_KEY
  GOOGLE_MAPS_ANDROID_API_KEY
  GOOGLE_MAPS_SERVER_API_KEY
  FIREBASE_API_KEY
  FIREBASE_APP_ID
  OPERATIONS_PRODUCT_ROLE_BINDINGS
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
)
for secret_name in "${gcp_secret_names[@]}"; do
  gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)' >/dev/null
done

for secret_name in FIREBASE_API_KEY FIREBASE_APP_ID GOOGLE_MAPS_SERVER_API_KEY GOOGLE_OAUTH_SERVER_CLIENT_ID OPERATIONS_PRODUCT_ROLE_BINDINGS; do
  gcloud secrets get-iam-policy "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format=json \
    | jq -e --arg member "serviceAccount:$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" \
      '.bindings[]? | select(.role == "roles/secretmanager.secretAccessor") | .members[]? | select(. == $member)' >/dev/null
done

gcloud builds list --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --limit=1 --format=json \
  | jq '[.[] | {id,status,createTime,finishTime}]' > "$evidence/latest-cloud-build.json"
gcloud logging read 'resource.type="cloud_run_revision"' --project "$GOOGLE_CLOUD_PROJECT" --freshness=1h --limit=1 --format=json \
  | jq '[.[] | {timestamp,severity,resourceType:.resource.type}]' > "$evidence/logging-signal.json"
gcloud monitoring policies list --project "$GOOGLE_CLOUD_PROJECT" --format=json \
  | jq '[.[] | {name,displayName,enabled}]' > "$evidence/alert-policies.json"

echo 'Live production metadata and least-privilege boundaries verified without reading secret values.'
