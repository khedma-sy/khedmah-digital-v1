#!/usr/bin/env bash
set -euo pipefail
output="${1:-artifacts/live-certification/evidence}"
mkdir -p "$output"
chmod 700 "$output"
required=(gcloud jq)
for command_name in "${required[@]}"; do command -v "$command_name" >/dev/null || { echo "missing required command: $command_name" >&2; exit 3; }; done
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION FIREBASE_PROJECT_ID OPERATIONS_RUNTIME_SERVICE_ACCOUNT OPERATIONS_DEPLOYER_SERVICE_ACCOUNT OPERATIONS_BACKEND_SERVICE OPERATIONS_FRONTEND_SERVICE; do
  [[ -n "${!name:-}" ]] || { echo "missing required environment variable: $name" >&2; exit 4; }
done
[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || { echo 'OPERATIONS_APPROVED_PRODUCTION=true is required' >&2; exit 5; }
active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
[[ -n "$active_account" ]] || { echo 'no active gcloud identity' >&2; exit 6; }
# Evidence contains metadata only. Secret payloads, tokens, URLs, log payloads and IAM member identities are excluded.
gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format=json | jq '{projectNumber,lifecycleState,createTime}' > "$output/project.json"
gcloud services list --enabled --project "$GOOGLE_CLOUD_PROJECT" --format=json | jq '[.[] | {name:.config.name,state}]' > "$output/enabled-services.json"
gcloud run services list --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format=json | jq '[.[] | {name:.metadata.name,latestReadyRevision:.status.latestReadyRevisionName,traffic:.status.traffic}]' > "$output/cloud-run.json"
gcloud builds list --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --limit=20 --format=json | jq '[.[] | {id,status,createTime,startTime,finishTime,images}]' > "$output/cloud-build.json"
gcloud artifacts repositories list --project "$GOOGLE_CLOUD_PROJECT" --location "$GOOGLE_CLOUD_REGION" --format=json | jq '[.[] | {name,format,createTime,updateTime}]' > "$output/artifact-registry.json"
gcloud iam service-accounts list --project "$GOOGLE_CLOUD_PROJECT" --format=json | jq --arg runtime "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" --arg deployer "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" '[.[] | select(.email == $runtime or .email == $deployer) | {email,disabled}]' > "$output/service-accounts.json"
for account in "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"; do
  safe_name="${account%%@*}"
  gcloud iam service-accounts keys list --iam-account "$account" --managed-by=user --format=json | jq '[.[] | {name,keyType,keyOrigin,validAfterTime,validBeforeTime,disabled}]' > "$output/service-account-user-keys-$safe_name.json"
done
gcloud projects get-iam-policy "$GOOGLE_CLOUD_PROJECT" --format=json | jq '[.bindings[] | {role,memberCount:(.members|length),condition:(.condition // null)}]' > "$output/iam-summary.json"
gcloud secrets list --project "$GOOGLE_CLOUD_PROJECT" --format=json | jq '[.[] | {name,createTime,labels,replication}]' > "$output/secrets.json"
gcloud alpha monitoring policies list --project "$GOOGLE_CLOUD_PROJECT" --format=json | jq '[.[] | {name,displayName,enabled,combiner}]' > "$output/alert-policies.json"
gcloud logging read 'resource.type="cloud_run_revision"' --project "$GOOGLE_CLOUD_PROJECT" --freshness=1h --limit=1 --format=json | jq '[.[] | {timestamp,severity,resourceType:.resource.type}]' > "$output/logging-signal.json"
gcloud certificate-manager certificates list --project "$GOOGLE_CLOUD_PROJECT" --location=global --format=json | jq '[.[] | {name,state,scope,createTime,updateTime}]' > "$output/certificates.json"
gcloud dns managed-zones list --project "$GOOGLE_CLOUD_PROJECT" --format=json | jq '[.[] | {name,dnsName,visibility,creationTime}]' > "$output/dns-zones.json"
gcloud projects describe "$FIREBASE_PROJECT_ID" --format=json | jq '{projectNumber,lifecycleState,createTime}' > "$output/firebase-project.json"
gcloud services list --enabled --project "$FIREBASE_PROJECT_ID" --format=json | jq '[.[] | select(.config.name | test("firebase|identitytoolkit|fcm|analytics")) | {name:.config.name,state}]' > "$output/firebase-services.json"
printf '{"collectedAt":"%s","collectorVersion":"1","status":"collected"}\n' "$(date -u +%FT%TZ)" > "$output/manifest.json"
echo "Live evidence collected in $output; review and attach through the approved restricted evidence channel."
