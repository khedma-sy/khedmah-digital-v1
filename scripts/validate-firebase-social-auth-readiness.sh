#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"

FRONTEND_SERVICE="${OPERATIONS_FRONTEND_SERVICE:-frontend}"
CONFIG_FILE="$(mktemp)"
PROVIDERS_FILE="$(mktemp)"
cleanup() { rm -f "$CONFIG_FILE" "$PROVIDERS_FILE"; }
trap cleanup EXIT

for command_name in curl gcloud jq; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: Required command is unavailable: $command_name" >&2
    exit 1
  }
done

FRONTEND_URL="$(gcloud run services describe "$FRONTEND_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GOOGLE_CLOUD_REGION" \
  --format='value(status.url)')"
if [[ "$FRONTEND_URL" != https://* ]]; then
  echo "ERROR: Cloud Run frontend does not expose a valid HTTPS URL." >&2
  exit 1
fi
FRONTEND_HOST="${FRONTEND_URL#https://}"
FRONTEND_HOST="${FRONTEND_HOST%%/*}"

ACCESS_TOKEN="$(gcloud auth print-access-token)"
test -n "$ACCESS_TOKEN"
ADMIN_BASE="https://identitytoolkit.googleapis.com/admin/v2/projects/${GOOGLE_CLOUD_PROJECT}"

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${GOOGLE_CLOUD_PROJECT}" \
  "${ADMIN_BASE}/config" > "$CONFIG_FILE"

if ! jq -e --arg host "$FRONTEND_HOST" '(.authorizedDomains // []) | index($host) != null' "$CONFIG_FILE" >/dev/null; then
  echo "ERROR: Firebase authorizedDomains is missing the exact Cloud Run frontend host: ${FRONTEND_HOST}" >&2
  exit 1
fi

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${GOOGLE_CLOUD_PROJECT}" \
  "${ADMIN_BASE}/defaultSupportedIdpConfigs" > "$PROVIDERS_FILE"

for provider in google.com facebook.com; do
  if ! jq -e --arg provider "$provider" '
    (.defaultSupportedIdpConfigs // [])
    | any(
        (((.name // "") | split("/") | last) == $provider)
        and .enabled == true
        and ((.clientId // "") | length > 0)
      )
  ' "$PROVIDERS_FILE" >/dev/null; then
    echo "ERROR: Firebase provider ${provider} must be enabled and have a client ID before production deployment." >&2
    exit 1
  fi
done

echo "READY: FIREBASE_AUTHORIZED_DOMAIN=${FRONTEND_HOST}"
echo "READY: FIREBASE_SOCIAL_PROVIDERS=google.com,facebook.com"
