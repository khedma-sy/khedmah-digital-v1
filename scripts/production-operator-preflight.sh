#!/usr/bin/env bash
set -euo pipefail
set +x

for command_name in gcloud firebase terraform gh node npm docker jq; do
  command -v "$command_name" >/dev/null || { echo "Missing required operator command: $command_name" >&2; exit 20; }
done

for variable_name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION FIREBASE_PROJECT_ID OPERATIONS_RUNTIME_SERVICE_ACCOUNT OPERATIONS_DEPLOYER_SERVICE_ACCOUNT OPERATIONS_ARTIFACT_REPOSITORY OPERATIONS_BACKEND_SERVICE OPERATIONS_FRONTEND_SERVICE OPERATOR_OPERATION OPERATOR_CHANGE_TICKET; do
  [[ -n "${!variable_name:-}" ]] || { echo "Missing required operator variable: $variable_name" >&2; exit 21; }
done

[[ "${GITHUB_ACTIONS:-}" == "true" && "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]] || { echo 'Production operator must run through workflow_dispatch.' >&2; exit 22; }
[[ "${OPERATIONS_APPROVED_PRODUCTION:-}" == "true" ]] || { echo 'Production approval context is missing.' >&2; exit 23; }

active_google_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
[[ -n "$active_google_account" ]] || { echo 'Google OIDC authentication is not active.' >&2; exit 24; }
gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectNumber)' >/dev/null
firebase projects:list --json | jq -e --arg project "$FIREBASE_PROJECT_ID" '.result[]? | select(.projectId == $project)' >/dev/null
gh auth status --hostname github.com >/dev/null
docker info --format '{{.ServerVersion}}' >/dev/null

mkdir -p "$EVIDENCE_DIRECTORY"
jq -n \
  --arg collectedAt "$(date -u +%FT%TZ)" \
  --arg node "$(node --version)" \
  --arg npm "$(npm --version)" \
  --arg gcloud "$(gcloud version --format=json | jq -r '."Google Cloud SDK"')" \
  --arg firebase "$(firebase --version)" \
  --arg terraform "$(terraform version -json | jq -r '.terraform_version')" \
  --arg gh "$(gh --version | head -n1 | awk '{print $3}')" \
  --arg docker "$(docker version --format '{{.Server.Version}}')" \
  '{collectedAt:$collectedAt,node:$node,npm:$npm,gcloud:$gcloud,firebase:$firebase,terraform:$terraform,githubCli:$gh,docker:$docker,authentication:"verified",secretValuesRead:false}' \
  > "$EVIDENCE_DIRECTORY/toolchain-and-auth.json"

echo 'Production operator toolchain and federated authentication verified.'
