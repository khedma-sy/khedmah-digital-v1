#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL is required}"

FRONTEND_SERVICE="${OPERATIONS_FRONTEND_SERVICE:-frontend}"
FACEBOOK_AUTH_ENABLED="${FACEBOOK_AUTH_ENABLED:-false}"
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
ADMIN_BASE="https://identitytoolkit.googleapis.com/admin/v2/projects/${GOOGLE_CLOUD_PROJECT}"

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${GOOGLE_CLOUD_PROJECT}" \
  "${ADMIN_BASE}/config" > "$CONFIG_FILE"

[[ "$NEXT_PUBLIC_SITE_URL" == https://* ]] || {
  echo 'ERROR: NEXT_PUBLIC_SITE_URL must use HTTPS.' >&2
  exit 1
}
CANONICAL_HOST="${NEXT_PUBLIC_SITE_URL#https://}"
CANONICAL_HOST="${CANONICAL_HOST%%/*}"
[[ -n "$CANONICAL_HOST" && "$CANONICAL_HOST" != *"@"* && "$CANONICAL_HOST" != *":"* ]] || {
  echo 'ERROR: NEXT_PUBLIC_SITE_URL must contain one canonical public host without credentials or port.' >&2
  exit 1
}

for host in "$FRONTEND_HOST" "$CANONICAL_HOST"; do
  if ! jq -e --arg host "$host" '(.authorizedDomains // []) | index($host) != null' "$CONFIG_FILE" >/dev/null; then
    echo "ERROR: Firebase authorizedDomains is missing required host: ${host}" >&2
    exit 1
  fi
done

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${GOOGLE_CLOUD_PROJECT}" \
  "${ADMIN_BASE}/defaultSupportedIdpConfigs" > "$PROVIDERS_FILE"

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

echo "READY: FIREBASE_AUTHORIZED_DOMAINS=${FRONTEND_HOST},${CANONICAL_HOST}"
if [[ "$FACEBOOK_AUTH_ENABLED" == true ]]; then
  echo "READY: FIREBASE_SOCIAL_PROVIDERS=google.com,facebook.com"
else
  echo "READY: FIREBASE_SOCIAL_PROVIDERS=google.com"
  echo "DEFERRED: FIREBASE_PROVIDER=facebook.com"
fi
