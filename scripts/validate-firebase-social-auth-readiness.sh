#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"

FRONTEND_SERVICE="${OPERATIONS_FRONTEND_SERVICE:-frontend}"
FACEBOOK_AUTH_ENABLED="${FACEBOOK_AUTH_ENABLED:-false}"
IDENTITY_PROJECT="${FIREBASE_PROJECT_ID:-$GOOGLE_CLOUD_PROJECT}"
CONFIG_FILE="$(mktemp)"
PROVIDERS_FILE="$(mktemp)"
cleanup() { rm -f "$CONFIG_FILE" "$PROVIDERS_FILE"; }
trap cleanup EXIT

if [[ "$FACEBOOK_AUTH_ENABLED" != true && "$FACEBOOK_AUTH_ENABLED" != false ]]; then
  echo "ERROR: FACEBOOK_AUTH_ENABLED must be true or false." >&2
  exit 1
fi

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
ADMIN_BASE="https://identitytoolkit.googleapis.com/admin/v2/projects/${IDENTITY_PROJECT}"

if ! curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${ADMIN_BASE}/config" > "$CONFIG_FILE"; then
  echo "ERROR: Deployment identity cannot read Firebase Authentication config for ${IDENTITY_PROJECT}. Grant roles/firebaseauth.viewer to the deployer service account." >&2
  exit 1
fi

if ! jq -e --arg host "$FRONTEND_HOST" '(.authorizedDomains // []) | index($host) != null' "$CONFIG_FILE" >/dev/null; then
  echo "ERROR: Firebase authorizedDomains is missing the exact Cloud Run frontend host: ${FRONTEND_HOST}" >&2
  exit 1
fi

if ! curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${ADMIN_BASE}/defaultSupportedIdpConfigs" > "$PROVIDERS_FILE"; then
  echo "ERROR: Deployment identity cannot read Firebase provider settings for ${IDENTITY_PROJECT}. Grant roles/firebaseauth.viewer to the deployer service account." >&2
  exit 1
fi

required_providers=(google.com)
if [[ "$FACEBOOK_AUTH_ENABLED" == true ]]; then
  required_providers+=(facebook.com)
fi

for provider in "${required_providers[@]}"; do
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
if [[ "$FACEBOOK_AUTH_ENABLED" == true ]]; then
  echo "READY: FIREBASE_SOCIAL_PROVIDERS=google.com,facebook.com"
else
  echo "READY: FIREBASE_SOCIAL_PROVIDERS=google.com"
  echo "DEFERRED: FIREBASE_PROVIDER=facebook.com"
fi
