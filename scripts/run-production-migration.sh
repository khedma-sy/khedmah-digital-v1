#!/bin/sh
set -eu

readonly APPROVED_MIGRATION_021='021_provider_reports'
readonly APPROVED_SHA256_021='61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698'
readonly APPROVED_MIGRATION_022='022_expand_category_taxonomy'
readonly APPROVED_SHA256_022='f6a8f8dd9c64b6cdbeb6eda29e53be1d48884b922b8e9aa6f2a1dcc8a6830330'
readonly APPROVED_MIGRATION_024='024_product_store'
readonly APPROVED_SHA256_024='d2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6'

case "${MIGRATION_VERSION:-}" in
  "$APPROVED_MIGRATION_021")
    APPROVED_SHA256="$APPROVED_SHA256_021"
    MIGRATION_FILE='/migrations/021_provider_reports.sql'
    ;;
  "$APPROVED_MIGRATION_022")
    APPROVED_SHA256="$APPROVED_SHA256_022"
    MIGRATION_FILE='/migrations/022_expand_category_taxonomy.sql'
    ;;
  "$APPROVED_MIGRATION_024")
    APPROVED_SHA256="$APPROVED_SHA256_024"
    MIGRATION_FILE='/migrations/024_product_store.sql'
    ;;
  *)
    echo "ERROR: Only ${APPROVED_MIGRATION_021}, ${APPROVED_MIGRATION_022}, or ${APPROVED_MIGRATION_024} is approved by this image." >&2
    exit 1
    ;;
esac
if [ "${MIGRATION_SHA256:-}" != "$APPROVED_SHA256" ]; then
  echo 'ERROR: Migration approval checksum does not match.' >&2
  exit 1
fi
test -n "${DATABASE_URL:-}"
test -n "${DATABASE_RUNTIME_USER:-}" || { echo 'ERROR: DATABASE_RUNTIME_USER is required.' >&2; exit 2; }
test -n "${DATABASE_MIGRATION_USER:-}" || { echo 'ERROR: DATABASE_MIGRATION_USER is required.' >&2; exit 2; }
test -n "${DATABASE_RUNTIME_ROLE:-}" || { echo 'ERROR: DATABASE_RUNTIME_ROLE is required.' >&2; exit 2; }
test -n "${DATABASE_MIGRATION_ROLE:-}" || { echo 'ERROR: DATABASE_MIGRATION_ROLE is required.' >&2; exit 2; }
test -n "${DATABASE_NAME:-}" || { echo 'ERROR: DATABASE_NAME is required.' >&2; exit 2; }
test -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" || {
  echo 'ERROR: CLOUD_SQL_INSTANCE_CONNECTION_NAME is required for Production database operations.' >&2
  exit 2
}
PSQL_DATABASE_URL="$DATABASE_URL"
case "$DATABASE_MIGRATION_USER" in
  ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*)
    echo 'ERROR: DATABASE_MIGRATION_USER is malformed.' >&2
    exit 2
    ;;
esac
test "${#DATABASE_MIGRATION_USER}" -le 63 || {
  echo 'ERROR: DATABASE_MIGRATION_USER exceeds the PostgreSQL identifier limit.' >&2
  exit 2
}
for DATABASE_ROLE_IDENTIFIER in "$DATABASE_RUNTIME_USER" "$DATABASE_RUNTIME_ROLE" "$DATABASE_MIGRATION_ROLE"; do
  case "$DATABASE_ROLE_IDENTIFIER" in
    ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*)
      echo 'ERROR: Production database role identifier is malformed.' >&2
      exit 2
      ;;
  esac
  test "${#DATABASE_ROLE_IDENTIFIER}" -le 63 || {
    echo 'ERROR: Production database role identifier exceeds the PostgreSQL identifier limit.' >&2
    exit 2
  }
done
unset DATABASE_ROLE_IDENTIFIER
test "$DATABASE_RUNTIME_USER" != "$DATABASE_MIGRATION_USER" \
  && test "$DATABASE_RUNTIME_USER" != "$DATABASE_RUNTIME_ROLE" \
  && test "$DATABASE_RUNTIME_USER" != "$DATABASE_MIGRATION_ROLE" \
  && test "$DATABASE_MIGRATION_USER" != "$DATABASE_RUNTIME_ROLE" \
  && test "$DATABASE_MIGRATION_USER" != "$DATABASE_MIGRATION_ROLE" \
  && test "$DATABASE_RUNTIME_ROLE" != "$DATABASE_MIGRATION_ROLE" || {
  echo 'ERROR: Production database login users and privilege roles must all be distinct.' >&2
  exit 2
}
for DATABASE_ROLE_IDENTIFIER in "$DATABASE_RUNTIME_USER" "$DATABASE_MIGRATION_USER" "$DATABASE_RUNTIME_ROLE" "$DATABASE_MIGRATION_ROLE"; do
  case "$DATABASE_ROLE_IDENTIFIER" in
    postgres|cloudsqlsuperuser)
      echo 'ERROR: Production database role identifiers must not use a system role name.' >&2
      exit 2
      ;;
  esac
done
unset DATABASE_ROLE_IDENTIFIER
case "$DATABASE_NAME" in
  ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*)
    echo 'ERROR: DATABASE_NAME is malformed.' >&2
    exit 2
    ;;
esac
test "${#DATABASE_NAME}" -le 63 || {
  echo 'ERROR: DATABASE_NAME exceeds the PostgreSQL identifier limit.' >&2
  exit 2
}
case "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" in
  *:*:*) ;;
  *)
    echo 'ERROR: invalid Cloud SQL instance connection name.' >&2
    exit 2
    ;;
esac
case "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" in
  *:*:*:*|*[!a-z0-9:-]*)
    echo 'ERROR: invalid Cloud SQL instance connection name.' >&2
    exit 2
    ;;
esac
CLOUD_SQL_PROJECT="${CLOUD_SQL_INSTANCE_CONNECTION_NAME%%:*}"
CLOUD_SQL_REST="${CLOUD_SQL_INSTANCE_CONNECTION_NAME#*:}"
CLOUD_SQL_REGION="${CLOUD_SQL_REST%%:*}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_REST#*:}"
for CLOUD_SQL_COMPONENT in "$CLOUD_SQL_PROJECT" "$CLOUD_SQL_REGION" "$CLOUD_SQL_INSTANCE"; do
  case "$CLOUD_SQL_COMPONENT" in
    ''|[!a-z0-9]*|*[!a-z0-9-]*)
      echo 'ERROR: invalid Cloud SQL instance connection name.' >&2
      exit 2
      ;;
  esac
done
unset CLOUD_SQL_COMPONENT CLOUD_SQL_INSTANCE CLOUD_SQL_REGION CLOUD_SQL_REST CLOUD_SQL_PROJECT
case "$DATABASE_URL" in
  postgres://*) DATABASE_URI_SCHEME='postgres'; DATABASE_URI_REST="${DATABASE_URL#postgres://}" ;;
  postgresql://*) DATABASE_URI_SCHEME='postgresql'; DATABASE_URI_REST="${DATABASE_URL#postgresql://}" ;;
  *) echo 'ERROR: DATABASE_URL must be a PostgreSQL URI.' >&2; exit 2 ;;
esac
case "$DATABASE_URI_REST" in
  *@localhost/*) ;;
  *) echo 'ERROR: Cloud SQL DATABASE_URL must use the approved localhost authority.' >&2; exit 2 ;;
esac
DATABASE_CREDENTIALS="${DATABASE_URI_REST%%@localhost/*}"
DATABASE_NAME_FROM_URL="${DATABASE_URI_REST#*@localhost/}"
case "$DATABASE_CREDENTIALS" in
  ''|*'@'*|*'/'*|*'?'*|*'#'*) echo 'ERROR: Cloud SQL DATABASE_URL credentials are malformed.' >&2; exit 2 ;;
esac
DATABASE_USER_FROM_URL="${DATABASE_CREDENTIALS%%:*}"
DATABASE_PASSWORD_FROM_URL="${DATABASE_CREDENTIALS#*:}"
test "$DATABASE_PASSWORD_FROM_URL" != "$DATABASE_CREDENTIALS" || {
  echo 'ERROR: Cloud SQL DATABASE_URL credentials are malformed.' >&2
  exit 2
}
case "$DATABASE_USER_FROM_URL" in
  ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*)
    echo 'ERROR: Cloud SQL DATABASE_URL user is malformed.' >&2
    exit 2
    ;;
esac
case "$DATABASE_PASSWORD_FROM_URL" in
  ''|*[!0-9a-f]*)
    echo 'ERROR: Cloud SQL DATABASE_URL password must use the managed 256-bit hexadecimal format.' >&2
    exit 2
    ;;
esac
test "${#DATABASE_PASSWORD_FROM_URL}" -eq 64 || {
  echo 'ERROR: Cloud SQL DATABASE_URL password must use the managed 256-bit hexadecimal format.' >&2
  exit 2
}
case "$DATABASE_NAME_FROM_URL" in
  ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*)
    echo 'ERROR: Cloud SQL DATABASE_URL database is malformed.' >&2
    exit 2
    ;;
esac
test "$DATABASE_USER_FROM_URL" = "$DATABASE_MIGRATION_USER" || {
  echo 'ERROR: Cloud SQL DATABASE_URL user does not match DATABASE_MIGRATION_USER.' >&2
  exit 2
}
test "$DATABASE_NAME_FROM_URL" = "$DATABASE_NAME" || {
  echo 'ERROR: Cloud SQL DATABASE_URL database does not match DATABASE_NAME.' >&2
  exit 2
}
PSQL_DATABASE_URL="${DATABASE_URI_SCHEME}://${DATABASE_CREDENTIALS}@/${DATABASE_NAME_FROM_URL}"
PGHOST="/cloudsql/$CLOUD_SQL_INSTANCE_CONNECTION_NAME"
PGPORT=5432
PGSSLMODE=disable
unset PGHOSTADDR PGSERVICE PGSERVICEFILE
export PGHOST PGPORT PGSSLMODE
# Keep public as the only explicit creation target. PostgreSQL implicitly
# searches pg_catalog first when it is not named in search_path.
# The reviewed migration SQL expects public to be the sole creation target.
# Replace, rather than append to, any ambient libpq session options.
PGOPTIONS='-c role=none -c search_path=public'
export PGOPTIONS
printf '%s  %s\n' "$APPROVED_SHA256" "$MIGRATION_FILE" | sha256sum -c -
connection_state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  current_setting('server_version_num')::integer >= 160000
  AND current_user = '$DATABASE_MIGRATION_USER'
  AND session_user = '$DATABASE_MIGRATION_USER'
  AND current_database() = '$DATABASE_NAME'
THEN 'ready' ELSE 'blocked' END")"
test "$connection_state" = ready || {
  echo 'ERROR: PRODUCTION_DATABASE_CONNECTION_IDENTITY_NOT_READY' >&2
  exit 3
}

# Reuse one fail-closed isolation predicate before the migration and again
# after taking the shared schema lock to close the authorization TOCTOU gap.
DATABASE_ROLE_ISOLATION_SAFE_SQL="
  current_setting('server_version_num')::integer >= 160000
  AND current_user='$DATABASE_MIGRATION_USER'
  AND session_user='$DATABASE_MIGRATION_USER'
  AND current_database()='$DATABASE_NAME'
  AND 4=(
    SELECT count(*) FROM pg_catalog.pg_roles role
    WHERE role.rolname IN (
      '$DATABASE_RUNTIME_USER','$DATABASE_MIGRATION_USER',
      '$DATABASE_RUNTIME_ROLE','$DATABASE_MIGRATION_ROLE'
    )
  )
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles role
    WHERE role.rolname='$DATABASE_RUNTIME_USER'
      AND role.rolcanlogin AND role.rolinherit
      AND NOT role.rolsuper AND NOT role.rolcreatedb AND NOT role.rolcreaterole
      AND NOT role.rolreplication AND NOT role.rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles role
    WHERE role.rolname='$DATABASE_MIGRATION_USER'
      AND role.rolcanlogin AND role.rolinherit
      AND NOT role.rolsuper AND NOT role.rolcreatedb AND NOT role.rolcreaterole
      AND NOT role.rolreplication AND NOT role.rolbypassrls
  )
  AND 2=(
    SELECT count(*) FROM pg_catalog.pg_roles role
    WHERE role.rolname IN ('$DATABASE_RUNTIME_ROLE','$DATABASE_MIGRATION_ROLE')
      AND NOT role.rolcanlogin AND role.rolinherit
      AND NOT role.rolsuper AND NOT role.rolcreatedb AND NOT role.rolcreaterole
      AND NOT role.rolreplication AND NOT role.rolbypassrls
  )
  AND NOT pg_catalog.pg_has_role('$DATABASE_RUNTIME_USER','cloudsqlsuperuser','member')
  AND NOT pg_catalog.pg_has_role('$DATABASE_MIGRATION_USER','cloudsqlsuperuser','member')
  AND 1=(
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$DATABASE_RUNTIME_USER'
      AND granted_role.rolname='$DATABASE_RUNTIME_ROLE'
      AND NOT membership.admin_option
      AND membership.inherit_option
      AND membership.set_option
  )
  AND 1=(
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$DATABASE_MIGRATION_USER'
      AND granted_role.rolname='$DATABASE_MIGRATION_ROLE'
      AND NOT membership.admin_option
      AND membership.inherit_option
      AND membership.set_option
  )
  AND 1=(
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$DATABASE_RUNTIME_USER'
  )
  AND 1=(
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$DATABASE_MIGRATION_USER'
  )
  AND 2=(
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('$DATABASE_RUNTIME_ROLE','$DATABASE_MIGRATION_ROLE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname IN ('$DATABASE_RUNTIME_ROLE','$DATABASE_MIGRATION_ROLE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('$DATABASE_RUNTIME_USER','$DATABASE_MIGRATION_USER')
  )
"

database_role_isolation_state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
$DATABASE_ROLE_ISOLATION_SAFE_SQL
THEN 'ready' ELSE 'blocked' END")"
test "$database_role_isolation_state" = ready || {
  echo 'ERROR: PRODUCTION_DATABASE_ROLE_ISOLATION_NOT_READY' >&2
  exit 3
}

if [ "$MIGRATION_VERSION" = "$APPROVED_MIGRATION_021" ]; then
  psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$database_role_isolation\$
BEGIN
  IF NOT (
$DATABASE_ROLE_ISOLATION_SAFE_SQL
  ) THEN
    RAISE EXCEPTION 'PRODUCTION_DATABASE_ROLE_ISOLATION_NOT_READY';
  END IF;
END
\$database_role_isolation\$;
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_021_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_021_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY[
    'report_identifier',
    'reporter_user_identifier',
    'target_type',
    'business_profile_id',
    'professional_profile_identifier',
    'reason_code',
    'details',
    'status',
    'reviewed_by_user_identifier',
    'resolution_note',
    'created_at',
    'updated_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'provider_reports'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_021_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'provider_reports'
      AND c.conname = 'provider_reports_exactly_one_target_check'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_021_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'provider_reports'
      AND indexname = 'provider_reports_open_reporter_target_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_021_INDEX_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

  printf '%s\n' 'MIGRATION_021_APPLIED_AND_VERIFIED'
  exit 0
fi

if [ "$MIGRATION_VERSION" = "$APPROVED_MIGRATION_024" ]; then
  psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$database_role_isolation\$
BEGIN
  IF NOT (
$DATABASE_ROLE_ISOLATION_SAFE_SQL
  ) THEN
    RAISE EXCEPTION 'PRODUCTION_DATABASE_ROLE_ISOLATION_NOT_READY';
  END IF;
END
\$database_role_isolation\$;
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_REQUIRES_SCHEMA_022';
  END IF;
  IF to_regclass(current_schema() || '.product_listings') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_TABLE_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY[
    'business_profile_id', 'owner_user_id', 'title_ar', 'price', 'currency',
    'category_code', 'availability', 'status', 'moderation_status'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'product_listings'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_024_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'product_listings'
      AND indexname = 'product_listings_public_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_024_INDEX_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'media_assets'
      AND c.conname = 'media_assets_owner_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%product_listing%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'media_assets'
      AND c.conname = 'media_assets_asset_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%product_image%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_024_MEDIA_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

  printf '%s\n' 'MIGRATION_024_APPLIED_AND_VERIFIED'
  exit 0
fi

psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$database_role_isolation\$
BEGIN
  IF NOT (
$DATABASE_ROLE_ISOLATION_SAFE_SQL
  ) THEN
    RAISE EXCEPTION 'PRODUCTION_DATABASE_ROLE_ISOLATION_NOT_READY';
  END IF;
END
\$database_role_isolation\$;
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_REQUIRES_SCHEMA_021';
  END IF;
  IF to_regclass(current_schema() || '.organizations') IS NULL
    OR to_regclass(current_schema() || '.organization_members') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_MISSING';
  END IF;
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'categories'
        AND column_name IN ('parent_code', 'visual_key', 'search_aliases_ar', 'search_aliases_en', 'is_featured')
    )
    OR to_regclass(current_schema() || '.product_listings') IS NOT NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_022_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  IF to_regclass(current_schema() || '.organizations') IS NULL
    OR to_regclass(current_schema() || '.organization_members') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY[
    'parent_code',
    'visual_key',
    'search_aliases_ar',
    'search_aliases_en',
    'is_featured'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'categories'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_022_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_BEFORE_IMAGE_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'categories'
      AND c.conname = 'categories_parent_code_fk'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'categories'
      AND indexname = 'categories_parent_public_order_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_INDEX_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE code = 'electrician' AND parent_code = 'home_maintenance')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'plumber' AND parent_code = 'home_maintenance')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'butcher' AND parent_code = 'food_hospitality')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'grocery' AND parent_code = 'food_hospitality')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'taxi' AND parent_code = 'transport_logistics')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'delivery_courier' AND parent_code = 'transport_logistics')
  THEN
    RAISE EXCEPTION 'MIGRATION_022_TAXONOMY_POSTCONDITION_FAILED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM categories
    WHERE status = 'active'
      AND parent_code IS NULL
      AND code NOT IN (
        'home_maintenance', 'food_hospitality', 'health_medical', 'education_training',
        'professional_services', 'beauty_personal_care', 'retail_shopping', 'automotive',
        'transport_logistics', 'technology_digital', 'construction_real_estate',
        'events_occasions', 'agriculture_livestock', 'industrial_supply', 'travel_tourism'
      )
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_NONCANONICAL_ACTIVE_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

printf '%s\n' 'MIGRATION_022_APPLIED_AND_VERIFIED'
