#!/usr/bin/env bash
set -euo pipefail
set +x

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-europe-west1}"

# Reject stale hosting configuration before any cloud call.
if [[ "${GOOGLE_CLOUD_REGION:-}" != "europe-west1" ]]; then
  echo "ERROR: GOOGLE_CLOUD_REGION must be europe-west1 for approved Production operations." >&2
  exit 64
fi

CLOUD_SQL_INSTANCE_ID="${CLOUD_SQL_INSTANCE_ID:-khedmah-v1-db}"
DATABASE_NAME="${DATABASE_NAME:-khedmah}"
DATABASE_USER="${DATABASE_USER:-khedmah_app}"
MIGRATION_DATABASE_USER="${MIGRATION_DATABASE_USER:-khedmah_migrator}"

for command_name in gcloud openssl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command_name" >&2
    exit 3
  }
done

legacy_project="project-""94512a0e-1a5e-4bdb-87f"
legacy_number="774201""339973"
[[ "$GOOGLE_CLOUD_PROJECT" != *"$legacy_project"* && "$GOOGLE_CLOUD_PROJECT" != *"$legacy_number"* ]] || {
  echo 'ERROR: refusing to configure the legacy Google project.' >&2
  exit 2
}
[[ "$DATABASE_USER" != "$MIGRATION_DATABASE_USER" ]] || {
  echo 'ERROR: runtime and migration database users must be distinct.' >&2
  exit 2
}
gcloud config set project "$GOOGLE_CLOUD_PROJECT" >/dev/null
actual_region="$(gcloud sql instances describe "$CLOUD_SQL_INSTANCE_ID"   --project "$GOOGLE_CLOUD_PROJECT" --format='value(region)')"
[[ "$actual_region" == "$GOOGLE_CLOUD_REGION" ]] || {
  echo 'ERROR: Cloud SQL region does not match GOOGLE_CLOUD_REGION.' >&2
  exit 4
}

gcloud sql databases describe "$DATABASE_NAME"   --instance "$CLOUD_SQL_INSTANCE_ID"   --project "$GOOGLE_CLOUD_PROJECT"   --format='value(name)' >/dev/null

for secret_name in DATABASE_URL DATABASE_MIGRATION_URL; do
  gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)' >/dev/null
done

runtime_password="$(openssl rand -hex 32)"
migration_password="$(openssl rand -hex 32)"
trap 'unset runtime_password migration_password DATABASE_URL DATABASE_MIGRATION_URL' EXIT

ensure_user_password() {
  local user="$1" password="$2"
  if gcloud sql users list     --instance "$CLOUD_SQL_INSTANCE_ID"     --project "$GOOGLE_CLOUD_PROJECT"     --filter="name=$user" --format='value(name)' | grep -F -x "$user" >/dev/null; then
    gcloud sql users set-password "$user"       --instance "$CLOUD_SQL_INSTANCE_ID" --project "$GOOGLE_CLOUD_PROJECT"       --password "$password" --quiet
  else
    gcloud sql users create "$user"       --instance "$CLOUD_SQL_INSTANCE_ID" --project "$GOOGLE_CLOUD_PROJECT"       --password "$password" --quiet
  fi
}

ensure_user_password "$DATABASE_USER" "$runtime_password"
ensure_user_password "$MIGRATION_DATABASE_USER" "$migration_password"

DATABASE_URL="postgresql://${DATABASE_USER}:${runtime_password}@localhost/${DATABASE_NAME}"
DATABASE_MIGRATION_URL="postgresql://${MIGRATION_DATABASE_USER}:${migration_password}@localhost/${DATABASE_NAME}"

printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL   --project "$GOOGLE_CLOUD_PROJECT" --data-file=- --quiet >/dev/null
printf '%s' "$DATABASE_MIGRATION_URL" | gcloud secrets versions add DATABASE_MIGRATION_URL   --project "$GOOGLE_CLOUD_PROJECT" --data-file=- --quiet >/dev/null

for secret_name in DATABASE_URL DATABASE_MIGRATION_URL; do
  state="$(gcloud secrets versions describe latest --secret "$secret_name"     --project "$GOOGLE_CLOUD_PROJECT" --format='value(state)')"
  [[ "$state" == "ENABLED" ]] || {
    echo "ERROR: $secret_name latest secret version is not enabled." >&2
    exit 5
  }
done

echo "READY: DATABASE_RUNTIME_USER=$DATABASE_USER"
echo "READY: DATABASE_MIGRATION_USER=$MIGRATION_DATABASE_USER"
echo "READY: DATABASE_NAME=$DATABASE_NAME"
echo "READY: CLOUD_SQL_INSTANCE_CONNECTION_NAME=${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:${CLOUD_SQL_INSTANCE_ID}"
echo 'READY: runtime and migration database secrets have enabled latest versions; values were not printed.'
echo 'SECURITY_BLOCKER: built-in users may still carry Cloud SQL default elevated database privileges until the protected database-role bootstrap workflow succeeds.'
echo 'NEXT: run Production Database Role Bootstrap / PREPARE_AND_ISOLATE before any schema migration.'
