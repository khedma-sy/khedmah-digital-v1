#!/usr/bin/env bash
set -euo pipefail
set +x

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-me-central1}"
CLOUD_SQL_INSTANCE_ID="${CLOUD_SQL_INSTANCE_ID:-khedmah-v1-db}"
DATABASE_NAME="${DATABASE_NAME:-khedmah}"
DATABASE_USER="${DATABASE_USER:-khedmah_app}"

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

gcloud config set project "$GOOGLE_CLOUD_PROJECT" >/dev/null

actual_region="$(gcloud sql instances describe "$CLOUD_SQL_INSTANCE_ID"   --project "$GOOGLE_CLOUD_PROJECT" --format='value(region)')"
[[ "$actual_region" == "$GOOGLE_CLOUD_REGION" ]] || {
  echo 'ERROR: Cloud SQL region does not match GOOGLE_CLOUD_REGION.' >&2
  exit 4
}

gcloud sql databases describe "$DATABASE_NAME"   --instance "$CLOUD_SQL_INSTANCE_ID"   --project "$GOOGLE_CLOUD_PROJECT"   --format='value(name)' >/dev/null

gcloud secrets describe DATABASE_URL   --project "$GOOGLE_CLOUD_PROJECT"   --format='value(name)' >/dev/null

password="$(openssl rand -hex 32)"
trap 'unset password DATABASE_URL' EXIT

if gcloud sql users list   --instance "$CLOUD_SQL_INSTANCE_ID"   --project "$GOOGLE_CLOUD_PROJECT"   --filter="name=$DATABASE_USER"   --format='value(name)' | grep -F -x "$DATABASE_USER" >/dev/null; then
  gcloud sql users set-password "$DATABASE_USER"     --instance "$CLOUD_SQL_INSTANCE_ID"     --project "$GOOGLE_CLOUD_PROJECT"     --password "$password"     --quiet
else
  gcloud sql users create "$DATABASE_USER"     --instance "$CLOUD_SQL_INSTANCE_ID"     --project "$GOOGLE_CLOUD_PROJECT"     --password "$password"     --quiet
fi

DATABASE_URL="postgresql://${DATABASE_USER}:${password}@localhost/${DATABASE_NAME}"
printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL   --project "$GOOGLE_CLOUD_PROJECT"   --data-file=-   --quiet >/dev/null

state="$(gcloud secrets versions describe latest   --secret DATABASE_URL   --project "$GOOGLE_CLOUD_PROJECT"   --format='value(state)')"
[[ "$state" == "ENABLED" ]] || {
  echo 'ERROR: DATABASE_URL latest secret version is not enabled.' >&2
  exit 5
}

echo "READY: DATABASE_USER=$DATABASE_USER"
echo "READY: DATABASE_NAME=$DATABASE_NAME"
echo "READY: CLOUD_SQL_INSTANCE_CONNECTION_NAME=${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:${CLOUD_SQL_INSTANCE_ID}"
echo 'READY: DATABASE_URL latest Secret Manager version is enabled; value was not printed.'
