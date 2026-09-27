#!/bin/sh
set -eu

MIGRATIONS="
001_core_identity_accounts
002_create_profiles
003_create_professional_profiles
004_analytics_and_contact
005_email_verifications_and_admin_roles
006_media_assets
007_v2_marketplace
008_provider_service_radius
009_canonical_identity_runtime
010_canonical_runtime_domains
011_canonical_media_contract
012_nearby_preferences
013_nearby_notifications_read_state
014_supplier_discovery
015_contact_target_contract
016_contact_submission_idempotency
017_category_taxonomy_contract
018_persistent_rate_limit_buckets
019_remove_out_of_scope_subscription_schema
020_identity_recovery_oauth
"

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 1; }
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
# The reviewed baseline SQL expects public to be the sole creation target.
# Replace, rather than append to, any ambient libpq session options.
PGOPTIONS='-c role=none -c search_path=public'
export PGOPTIONS
case "${BASELINE_MANIFEST_SHA256:-}" in
  ''|*[!0-9a-f]*)
    echo 'ERROR: BASELINE_MANIFEST_SHA256 must be a lowercase SHA-256.' >&2
    exit 1
    ;;
esac
test "${#BASELINE_MANIFEST_SHA256}" -eq 64 || {
  echo 'ERROR: BASELINE_MANIFEST_SHA256 must be a lowercase SHA-256.' >&2
  exit 1
}

files=''
for migration in $MIGRATIONS; do
  file="/migrations/${migration}.sql"
  test -r "$file" || { echo "ERROR: Missing baseline migration $file" >&2; exit 1; }
  files="$files $file"
done

actual_manifest_sha="$(cat $files | sha256sum | awk '{print $1}')"
test "$actual_manifest_sha" = "$BASELINE_MANIFEST_SHA256" || {
  echo 'ERROR: baseline migration manifest checksum mismatch.' >&2
  exit 1
}

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

# This predicate is deliberately reused before the lock and again while the
# shared schema lock is held. Schema mutation must never become a path around
# the completed Cloud SQL login/custom-role isolation contract.
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

fresh="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname = 'public'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database database
    WHERE database.datname=current_database()
      AND database.datallowconn
      AND NOT database.datistemplate
      AND database.datconnlimit=-1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database database
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database.datacl, '{}'::aclitem[])
    ) privilege
    WHERE database.datname=current_database()
      AND privilege.grantee=0
      AND privilege.privilege_type='CREATE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname <> 'public'
      AND namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname = 'khedmah_taxi'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname IN ('public','khedmah_taxi')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname IN ('public','khedmah_taxi')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type data_type
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = data_type.typnamespace
    WHERE namespace.nspname IN ('public','khedmah_taxi')
  )
  AND 1=(SELECT count(*) FROM pg_catalog.pg_default_acl)
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl defaults
    WHERE defaults.defaclrole=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
      AND defaults.defaclnamespace=0
      AND defaults.defaclobjtype='f'
      AND 1=(
        SELECT count(*)
        FROM pg_catalog.aclexplode(COALESCE(defaults.defaclacl, '{}'::aclitem[])) privilege
        WHERE privilege.grantee=defaults.defaclrole
          AND privilege.grantor=defaults.defaclrole
          AND privilege.privilege_type='EXECUTE'
          AND NOT privilege.is_grantable
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(defaults.defaclacl, '{}'::aclitem[])) privilege
        WHERE privilege.grantee<>defaults.defaclrole
          OR privilege.grantor<>defaults.defaclrole
          OR privilege.privilege_type<>'EXECUTE'
          OR privilege.is_grantable
      )
  )
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_foreign_server)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_user_mapping)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_subscription)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_prepared_xacts)
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension installed_extension
    WHERE installed_extension.extname <> 'plpgsql'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_cast user_cast
    WHERE user_cast.oid >= 16384
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_language language
    WHERE language.lanname NOT IN ('internal','c','sql','plpgsql')
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_operator operator
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=operator.oprnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_collation collation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=collation.collnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_conversion conversion
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=conversion.connamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_ts_config configuration
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=configuration.cfgnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_ts_dict dictionary
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=dictionary.dictnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_ts_parser parser
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=parser.prsnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_ts_template template
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=template.tmplnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_opclass operator_class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=operator_class.opcnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_opfamily operator_family
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=operator_family.opfnamespace
    WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
  )
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_transform)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl)
THEN 'fresh' ELSE 'dirty' END")"
test "$fresh" = fresh || {
  echo 'ERROR: BASELINE_REQUIRES_FRESH_DATABASE' >&2
  exit 1
}

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
DO \$baseline_fresh\$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace namespace
      WHERE namespace.nspname = 'public'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_database database
      WHERE database.datname=current_database()
        AND database.datallowconn
        AND NOT database.datistemplate
        AND database.datconnlimit=-1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_database database
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(database.datacl, '{}'::aclitem[])
      ) privilege
      WHERE database.datname=current_database()
        AND privilege.grantee=0
        AND privilege.privilege_type='CREATE'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace namespace
      WHERE namespace.nspname <> 'public'
        AND namespace.nspname <> 'information_schema'
        AND namespace.nspname !~ '^pg_'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace namespace
      WHERE namespace.nspname = 'khedmah_taxi'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname IN ('public','khedmah_taxi')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc routine
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname IN ('public','khedmah_taxi')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_type data_type
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = data_type.typnamespace
      WHERE namespace.nspname IN ('public','khedmah_taxi')
    )
    AND 1=(SELECT count(*) FROM pg_catalog.pg_default_acl)
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_default_acl defaults
      WHERE defaults.defaclrole=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
        AND defaults.defaclnamespace=0
        AND defaults.defaclobjtype='f'
        AND 1=(
          SELECT count(*)
          FROM pg_catalog.aclexplode(COALESCE(defaults.defaclacl, '{}'::aclitem[])) privilege
          WHERE privilege.grantee=defaults.defaclrole
            AND privilege.grantor=defaults.defaclrole
            AND privilege.privilege_type='EXECUTE'
            AND NOT privilege.is_grantable
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(defaults.defaclacl, '{}'::aclitem[])) privilege
          WHERE privilege.grantee<>defaults.defaclrole
            OR privilege.grantor<>defaults.defaclrole
            OR privilege.privilege_type<>'EXECUTE'
            OR privilege.is_grantable
        )
    )
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_foreign_server)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_user_mapping)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_subscription)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_prepared_xacts)
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_extension installed_extension
      WHERE installed_extension.extname <> 'plpgsql'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_cast user_cast
      WHERE user_cast.oid >= 16384
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_language language
      WHERE language.lanname NOT IN ('internal','c','sql','plpgsql')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_operator operator
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=operator.oprnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_collation collation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=collation.collnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_conversion conversion
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=conversion.connamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_ts_config configuration
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=configuration.cfgnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_ts_dict dictionary
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=dictionary.dictnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_ts_parser parser
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=parser.prsnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_ts_template template
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=template.tmplnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_opclass operator_class
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=operator_class.opcnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_opfamily operator_family
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=operator_family.opfnamespace
      WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
    )
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_transform)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl)
  ) THEN
    RAISE EXCEPTION 'BASELINE_REQUIRES_FRESH_DATABASE';
  END IF;
END
\$baseline_fresh\$;
\ir /migrations/001_core_identity_accounts.sql
\ir /migrations/002_create_profiles.sql
\ir /migrations/003_create_professional_profiles.sql
\ir /migrations/004_analytics_and_contact.sql
\ir /migrations/005_email_verifications_and_admin_roles.sql
\ir /migrations/006_media_assets.sql
\ir /migrations/007_v2_marketplace.sql
\ir /migrations/008_provider_service_radius.sql
\ir /migrations/009_canonical_identity_runtime.sql
\ir /migrations/010_canonical_runtime_domains.sql
\ir /migrations/011_canonical_media_contract.sql
\ir /migrations/012_nearby_preferences.sql
\ir /migrations/013_nearby_notifications_read_state.sql
\ir /migrations/014_supplier_discovery.sql
\ir /migrations/015_contact_target_contract.sql
\ir /migrations/016_contact_submission_idempotency.sql
\ir /migrations/017_category_taxonomy_contract.sql
\ir /migrations/018_persistent_rate_limit_buckets.sql
\ir /migrations/019_remove_out_of_scope_subscription_schema.sql
\ir /migrations/020_identity_recovery_oauth.sql

DO \$baseline_verify\$
BEGIN
  IF to_regclass('public.core_user_accounts') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.professional_profiles') IS NULL
    OR to_regclass('public.business_profiles') IS NULL
    OR to_regclass('public.locations') IS NULL
    OR to_regclass('public.organizations') IS NULL
    OR to_regclass('public.roles') IS NULL
    OR to_regclass('public.permissions') IS NULL
    OR to_regclass('public.media_assets') IS NULL
    OR to_regclass('public.identity_sessions') IS NULL
    OR to_regclass('public.nearby_preferences') IS NULL
    OR to_regclass('public.nearby_notifications') IS NULL
    OR to_regclass('public.supplier_capabilities') IS NULL
    OR to_regclass('public.contact_submission_idempotency') IS NULL
    OR to_regclass('public.categories') IS NULL
    OR to_regclass('public.rate_limit_buckets') IS NULL
    OR to_regclass('public.password_reset_tokens') IS NULL
    OR to_regclass('public.external_identities') IS NULL
  THEN
    RAISE EXCEPTION 'BASELINE_001_020_POSTCONDITION_FAILED';
  END IF;

  IF to_regclass('public.plans') IS NOT NULL OR to_regclass('public.subscriptions') IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE_019_SCOPE_RECONCILIATION_FAILED';
  END IF;
END
\$baseline_verify\$;
COMMIT;
SQL

echo "BASELINE_001_020_APPLIED_AND_VERIFIED"
