#!/usr/bin/env bash
set -euo pipefail
# Return only a safe sender address when an existing Preview secret can be bound.
# Never read, create, copy or print any secret payload; never fall back to Production.
[[ "${DEPLOYMENT_ENVIRONMENT:-}" == preview ]] || { echo 'Preview email resolution requires the preview environment.' >&2; exit 2; }
[[ -n "${GOOGLE_CLOUD_PROJECT:-}" && -n "${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}" ]] || { echo 'Missing isolated project identity.' >&2; exit 2; }
[[ "$GOOGLE_CLOUD_PROJECT" != "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]] || { echo 'Refusing Production email configuration.' >&2; exit 2; }
sender="${EMAIL_FROM:-noreply@mail.khedmah.uk}"
[[ "$sender" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo 'Preview EMAIL_FROM must be a single plain email address.' >&2; exit 2; }
if ! version="$(gcloud secrets versions list RESEND_API_KEY --project "$GOOGLE_CLOUD_PROJECT" --filter='state=ENABLED' --limit=1 --format='value(name)' 2>/dev/null)"; then
  echo 'Preview mail NOT READY: secret metadata is unavailable or permission is denied. No secret was copied and no delivery is certified.' >&2
  exit 0
fi
if [[ -z "$version" ]]; then
  echo 'Preview mail NOT READY: no enabled RESEND_API_KEY version exists in the Preview project.' >&2
  exit 0
fi
printf '%s\n' "$sender"
echo 'Existing Preview mail secret selected for runtime binding; actual delivery remains unverified.' >&2
