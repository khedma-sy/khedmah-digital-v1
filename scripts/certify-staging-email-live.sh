#!/usr/bin/env bash
set -euo pipefail
set +x

phase="${1:-${EMAIL_LIVE_PHASE:-REQUEST}}"
BACKEND_URL="${BACKEND_URL:?BACKEND_URL is required}"
TEST_EMAIL="${TEST_EMAIL:?TEST_EMAIL is required}"
TEST_PASSWORD="${TEST_PASSWORD:?TEST_PASSWORD is required}"

[[ "$BACKEND_URL" == https://* ]] || { echo 'ERROR: BACKEND_URL must use HTTPS.' >&2; exit 2; }
[[ "$BACKEND_URL" != *localhost* && "$BACKEND_URL" != *127.0.0.1* ]] || {
  echo 'ERROR: BACKEND_URL must reference deployed Staging.' >&2
  exit 2
}
curl --fail --silent --show-error --retry 4 --retry-all-errors "$BACKEND_URL/api/v1/health/ready" >/dev/null

case "$phase" in
  REQUEST)
    register_body="$(mktemp)"
    resend_body="$(mktemp)"
    trap 'rm -f "$register_body" "$resend_body"' EXIT
    status="$(curl --silent --show-error --output "$register_body" --write-out '%{http_code}' \
      --header 'Content-Type: application/json' \
      --data "$(jq -nc --arg email "$TEST_EMAIL" --arg password "$TEST_PASSWORD" --arg displayName 'Khedmah Email Certification' '{email:$email,password:$password,displayName:$displayName}')" \
      "$BACKEND_URL/api/v1/auth/register")"
    if [[ "$status" = "201" || "$status" = "200" ]]; then
      jq -e '.verificationRequired == true' "$register_body" >/dev/null
    elif [[ "$status" = "409" ]]; then
      resend_status="$(curl --silent --show-error --output "$resend_body" --write-out '%{http_code}' \
        --header 'Content-Type: application/json' \
        --data "$(jq -nc --arg email "$TEST_EMAIL" '{email:$email}')" \
        "$BACKEND_URL/api/v1/auth/email-verification/request")"
      [[ "$resend_status" = "201" || "$resend_status" = "200" ]]
      jq -e '.message == "If verification is required, an email has been sent."' "$resend_body" >/dev/null
    else
      cat "$register_body" >&2
      echo "ERROR: unexpected registration status $status" >&2
      exit 1
    fi

    login_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --header 'Content-Type: application/json' \
      --data "$(jq -nc --arg email "$TEST_EMAIL" --arg password "$TEST_PASSWORD" '{email:$email,password:$password}')" \
      "$BACKEND_URL/api/v1/auth/login")"
    [[ "$login_status" = "401" || "$login_status" = "403" ]] || {
      echo 'ERROR: test account is not pending verification; use a fresh staging test address.' >&2
      exit 1
    }
    echo 'EMAIL_LIVE_REQUEST=PASSED'
    echo 'NEXT: confirm inbox delivery, extract the delivered one-time token, then run CONFIRM.'
    ;;
  CONFIRM)
    VERIFICATION_TOKEN="${VERIFICATION_TOKEN:?VERIFICATION_TOKEN is required for CONFIRM}"
    confirm_body="$(mktemp)"
    cookie_jar="$(mktemp)"
    trap 'rm -f "$confirm_body" "$cookie_jar"; unset VERIFICATION_TOKEN' EXIT
    confirm_status="$(curl --silent --show-error --output "$confirm_body" --write-out '%{http_code}' \
      --header 'Content-Type: application/json' \
      --data "$(jq -nc --arg token "$VERIFICATION_TOKEN" '{token:$token}')" \
      "$BACKEND_URL/api/v1/auth/email-verification/confirm")"
    [[ "$confirm_status" = "201" || "$confirm_status" = "200" ]]
    jq -e '.message == "Email verified successfully."' "$confirm_body" >/dev/null

    login_status="$(curl --silent --show-error --cookie-jar "$cookie_jar" --output /dev/null --write-out '%{http_code}' \
      --header 'Content-Type: application/json' \
      --data "$(jq -nc --arg email "$TEST_EMAIL" --arg password "$TEST_PASSWORD" '{email:$email,password:$password}')" \
      "$BACKEND_URL/api/v1/auth/login")"
    [[ "$login_status" = "201" || "$login_status" = "200" ]]
    session_status="$(curl --silent --show-error --cookie "$cookie_jar" --output /dev/null --write-out '%{http_code}' \
      "$BACKEND_URL/api/v1/auth/session")"
    [[ "$session_status" = "200" ]]
    echo 'EMAIL_LIVE_CONFIRM=PASSED'
    ;;
  *)
    echo 'ERROR: phase must be REQUEST or CONFIRM.' >&2
    exit 2
    ;;
esac
