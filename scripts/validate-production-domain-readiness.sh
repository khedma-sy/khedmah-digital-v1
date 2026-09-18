#!/usr/bin/env bash
set -euo pipefail
set +x

: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL is required}"

for command_name in curl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command_name" >&2
    exit 3
  }
done

[[ "$NEXT_PUBLIC_SITE_URL" == https://* ]] || {
  echo 'ERROR: NEXT_PUBLIC_SITE_URL must use HTTPS.' >&2
  exit 4
}
canonical_origin="${NEXT_PUBLIC_SITE_URL%/}"
canonical_host="${canonical_origin#https://}"
canonical_host="${canonical_host%%/*}"
[[ -n "$canonical_host" && "$canonical_host" != *"@"* && "$canonical_host" != *":"* ]] || {
  echo 'ERROR: NEXT_PUBLIC_SITE_URL must contain one public host without credentials or port.' >&2
  exit 4
}
[[ "$canonical_host" != *.run.app && "$canonical_host" != localhost && "$canonical_host" != 127.0.0.1 ]] || {
  echo 'ERROR: canonical Production site must be the public domain, not Cloud Run or localhost.' >&2
  exit 4
}

body="$(mktemp)"
headers="$(mktemp)"
trap 'rm -f "$body" "$headers"' EXIT

effective_url="$(curl --fail --silent --show-error --location --max-redirs 5 \
  --connect-timeout 10 --max-time 30 \
  --dump-header "$headers" --output "$body" --write-out '%{url_effective}' \
  "$canonical_origin/")"

[[ "$effective_url" == https://* ]] || {
  echo 'ERROR: canonical site did not remain on HTTPS.' >&2
  exit 5
}
effective_host="${effective_url#https://}"
effective_host="${effective_host%%/*}"
[[ "$effective_host" == "$canonical_host" ]] || {
  echo "ERROR: canonical site redirected to a different host: $effective_host" >&2
  exit 5
}
[[ -s "$body" ]] || {
  echo 'ERROR: canonical site returned an empty response body.' >&2
  exit 5
}
content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/ {sub(/^[^:]+:[[:space:]]*/, ""); gsub(/\r/, ""); value=$0} END{print value}' "$headers")"
[[ "$content_type" == text/html* ]] || {
  echo "ERROR: canonical site did not return HTML: ${content_type:-missing}" >&2
  exit 5
}

echo "READY: PRODUCTION_CANONICAL_ORIGIN=$canonical_origin"
echo "READY: PRODUCTION_TLS_HOST=$canonical_host"
