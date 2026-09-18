#!/usr/bin/env bash
set -euo pipefail
set +x

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-me-central1}"
CLOUD_SQL_INSTANCE_ID="${CLOUD_SQL_INSTANCE_ID:-khedmah-v1-db}"
DATABASE_NAME="${DATABASE_NAME:-khedmah}"
DATABASE_USER="${DATABASE_USER:-khedmah_app}"
MIGRATION_DATABASE_USER="${MIGRATION_DATABASE_USER:-khedmah_migrator}"
RUNTIME_DATABASE_ROLE="${RUNTIME_DATABASE_ROLE:-khedmah_runtime_role}"
MIGRATION_DATABASE_ROLE="${MIGRATION_DATABASE_ROLE:-khedmah_migration_role}"

for command_name in gcloud openssl psql; do
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
for db_identifier in "$DATABASE_USER" "$MIGRATION_DATABASE_USER" "$RUNTIME_DATABASE_ROLE" "$MIGRATION_DATABASE_ROLE"; do
  [[ "$db_identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    echo "ERROR: invalid PostgreSQL identifier: $db_identifier" >&2
    exit 2
  }
done

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
trap 'unset runtime_password migration_password temporary_migration_url DATABASE_URL DATABASE_MIGRATION_URL' EXIT

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

# Cloud SQL grants cloudsqlsuperuser automatically to built-in users created
# without custom database roles. Bootstrap least-privilege roles while the
# migration account still has that temporary capability, then replace every
# inherited database role on both login users.
temporary_migration_url="postgresql://${MIGRATION_DATABASE_USER}:${migration_password}@localhost/${DATABASE_NAME}"
psql "$temporary_migration_url" -X -v ON_ERROR_STOP=1 <<SQL
DO \$roles\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RUNTIME_DATABASE_ROLE') THEN
    EXECUTE 'CREATE ROLE "$RUNTIME_DATABASE_ROLE" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$MIGRATION_DATABASE_ROLE') THEN
    EXECUTE 'CREATE ROLE "$MIGRATION_DATABASE_ROLE" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION';
  END IF;
END
\$roles\$;
GRANT CONNECT ON DATABASE "$DATABASE_NAME" TO "$RUNTIME_DATABASE_ROLE", "$MIGRATION_DATABASE_ROLE";
GRANT CREATE ON DATABASE "$DATABASE_NAME" TO "$MIGRATION_DATABASE_ROLE";
GRANT USAGE, CREATE ON SCHEMA public TO "$MIGRATION_DATABASE_ROLE";
SQL

gcloud sql users assign-roles "$DATABASE_USER" \
  --instance "$CLOUD_SQL_INSTANCE_ID" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --type BUILT_IN \
  --database-roles "$RUNTIME_DATABASE_ROLE" \
  --revoke-existing-roles \
  --quiet

gcloud sql users assign-roles "$MIGRATION_DATABASE_USER" \
  --instance "$CLOUD_SQL_INSTANCE_ID" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --type BUILT_IN \
  --database-roles "$MIGRATION_DATABASE_ROLE" \
  --revoke-existing-roles \
  --quiet

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

runtime_role_state="$(PGPASSWORD="$runtime_password" psql -h localhost -U "$DATABASE_USER" -d "$DATABASE_NAME" -X -Atc "SELECT pg_has_role(current_user,'cloudsqlsuperuser','member')::text || ':' || pg_has_role(current_user,'$RUNTIME_DATABASE_ROLE','member')::text")"
migration_role_state="$(PGPASSWORD="$migration_password" psql -h localhost -U "$MIGRATION_DATABASE_USER" -d "$DATABASE_NAME" -X -Atc "SELECT pg_has_role(current_user,'cloudsqlsuperuser','member')::text || ':' || pg_has_role(current_user,'$MIGRATION_DATABASE_ROLE','member')::text")"
[[ "$runtime_role_state" == "false:true" ]] || {
  echo 'ERROR: runtime database user role isolation failed.' >&2
  exit 6
}
[[ "$migration_role_state" == "false:true" ]] || {
  echo 'ERROR: migration database user role isolation failed.' >&2
  exit 6
}

echo "READY: DATABASE_RUNTIME_ROLE=$RUNTIME_DATABASE_ROLE"
echo "READY: DATABASE_MIGRATION_ROLE=$MIGRATION_DATABASE_ROLE"
echo "READY: DATABASE_RUNTIME_USER=$DATABASE_USER"
echo "READY: DATABASE_MIGRATION_USER=$MIGRATION_DATABASE_USER"
echo "READY: DATABASE_NAME=$DATABASE_NAME"
echo "READY: CLOUD_SQL_INSTANCE_CONNECTION_NAME=${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:${CLOUD_SQL_INSTANCE_ID}"
echo 'READY: runtime and migration database secrets have enabled latest versions; values were not printed.'
echo 'NEXT: run governed schema migrations with DATABASE_MIGRATION_URL, then apply runtime-role hardening before application deployment.'
