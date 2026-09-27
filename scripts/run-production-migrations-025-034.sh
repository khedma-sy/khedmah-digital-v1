#!/bin/sh
set -eu

case "${MIGRATION_NUMBER:-}" in
  025)
    MIGRATION_NAME='025_classifieds'
    PREDECESSOR_SQL="SELECT to_regclass('public.product_listings') IS NOT NULL"
    GUARD="to_regclass('public.ad_listings')"
    ;;
  026)
    MIGRATION_NAME='026_cash_fulfillment_orders'
    PREDECESSOR_SQL="SELECT to_regclass('public.ad_listings') IS NOT NULL"
    GUARD="to_regclass('public.fulfillment_orders')"
    ;;
  027)
    MIGRATION_NAME='027_mobility_document_reviews'
    PREDECESSOR_SQL="SELECT to_regclass('public.fulfillment_orders') IS NOT NULL"
    GUARD="to_regclass('public.mobility_document_reviews')"
    ;;
  028)
    MIGRATION_NAME='028_platform_notifications'
    PREDECESSOR_SQL="SELECT to_regclass('public.mobility_document_reviews') IS NOT NULL"
    GUARD="to_regclass('public.platform_notifications')"
    ;;
  029)
    MIGRATION_NAME='029_taxi_pricing_revisions'
    PREDECESSOR_SQL="SELECT to_regclass('public.platform_notifications') IS NOT NULL"
    GUARD="to_regclass('public.taxi_pricing_revisions')"
    ;;
  030)
    MIGRATION_NAME='030_billing_credits_subscriptions'
    PREDECESSOR_SQL="SELECT to_regclass('public.taxi_pricing_revisions') IS NOT NULL"
    GUARD="to_regclass('public.billing_program_config')"
    ;;
  031)
    MIGRATION_NAME='031_taxi_operational_approvals'
    PREDECESSOR_SQL="SELECT to_regclass('public.billing_program_config') IS NOT NULL"
    GUARD="to_regclass('khedmah_taxi.driver_approvals')"
    ;;
  032)
    MIGRATION_NAME='032_taxi_operational_profile_gate'
    PREDECESSOR_SQL="SELECT to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL AND to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL"
    GUARD="CASE
      WHEN to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NULL THEN NULL
      WHEN position('FROM public.business_profiles bb' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
       AND position(\$needle\$b.trust_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
       AND position(\$needle\$b.moderation_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
      THEN 1 ELSE NULL END"
    ;;
  033)
    MIGRATION_NAME='033_billing_admin_role'
    PREDECESSOR_SQL="SELECT to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NOT NULL
      AND position(\$needle\$b.trust_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0"
    GUARD="CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles'
        AND c.conname='admin_roles_role_check'
        AND pg_get_constraintdef(c.oid) LIKE '%billing_admin%'
    ) THEN 1 ELSE NULL END"
    ;;
  034)
    MIGRATION_NAME='034_food_order_promotions'
    PREDECESSOR_SQL="SELECT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles'
        AND c.conname='admin_roles_role_check'
        AND pg_get_constraintdef(c.oid) LIKE '%billing_admin%'
    )"
    GUARD="to_regclass('public.food_promo_codes')"
    ;;
  *)
    echo 'ERROR: MIGRATION_NUMBER must be one of 025..034.' >&2
    exit 1
    ;;
esac

MIGRATION_FILE="/migrations/${MIGRATION_NAME}.sql"

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
# The reviewed migration SQL expects public to be the sole creation target.
# Replace, rather than append to, any ambient libpq session options.
PGOPTIONS='-c role=none -c search_path=public'
export PGOPTIONS
case "${MIGRATION_SHA256:-}" in
  ''|*[!0-9a-f]*)
    echo 'ERROR: MIGRATION_SHA256 must be a lowercase SHA-256.' >&2
    exit 1
    ;;
esac
test "${#MIGRATION_SHA256}" -eq 64 || {
  echo 'ERROR: MIGRATION_SHA256 must be a lowercase SHA-256.' >&2
  exit 1
}
test -r "$MIGRATION_FILE" || { echo "ERROR: Missing migration file $MIGRATION_FILE" >&2; exit 1; }
printf '%s  %s\n' "$MIGRATION_SHA256" "$MIGRATION_FILE" | sha256sum -c -
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

predecessor_ok="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$PREDECESSOR_SQL")"
test "$predecessor_ok" = 't' || {
  echo "ERROR: MIGRATION_${MIGRATION_NUMBER}_PREDECESSOR_MISSING" >&2
  exit 1
}

already="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT CASE WHEN ($GUARD) IS NULL THEN '' ELSE 'applied' END")"
if [ "$already" = 'applied' ]; then
  echo "ERROR: MIGRATION_${MIGRATION_NUMBER}_ALREADY_APPLIED_OR_PARTIAL" >&2
  exit 1
fi

PREDECESSOR_EXPRESSION="${PREDECESSOR_SQL#SELECT }"

if [ "$MIGRATION_NUMBER" = '033' ] || [ "$MIGRATION_NUMBER" = '034' ]; then
  # These reviewed files contain their own BEGIN/COMMIT blocks. Hold a session
  # advisory lock around the include rather than nesting another transaction.
  psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT pg_advisory_lock(hashtextextended('khedmah-production-schema-change', 0));
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
  IF NOT ($PREDECESSOR_EXPRESSION) THEN
    RAISE EXCEPTION 'MIGRATION_${MIGRATION_NUMBER}_PREDECESSOR_MISSING';
  END IF;
  IF ($GUARD) IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_${MIGRATION_NUMBER}_ALREADY_APPLIED_OR_PARTIAL';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
SELECT pg_advisory_unlock(hashtextextended('khedmah-production-schema-change', 0));
SQL
else
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
  IF NOT ($PREDECESSOR_EXPRESSION) THEN
    RAISE EXCEPTION 'MIGRATION_${MIGRATION_NUMBER}_PREDECESSOR_MISSING';
  END IF;
  IF ($GUARD) IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_${MIGRATION_NUMBER}_ALREADY_APPLIED_OR_PARTIAL';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
COMMIT;
SQL
fi

case "$MIGRATION_NUMBER" in
  025) VERIFY_SQL="SELECT to_regclass('public.ad_listings') IS NOT NULL AND to_regclass('public.ad_free_slots') IS NOT NULL" ;;
  026) VERIFY_SQL="SELECT to_regclass('public.fulfillment_orders') IS NOT NULL AND to_regclass('public.fulfillment_order_items') IS NOT NULL" ;;
  027) VERIFY_SQL="SELECT to_regclass('public.mobility_document_reviews') IS NOT NULL AND to_regclass('public.mobility_document_review_events') IS NOT NULL" ;;
  028) VERIFY_SQL="SELECT to_regclass('public.platform_notifications') IS NOT NULL" ;;
  029) VERIFY_SQL="SELECT to_regclass('public.taxi_pricing_revisions') IS NOT NULL" ;;
  030) VERIFY_SQL="SELECT to_regclass('public.billing_program_config') IS NOT NULL AND to_regclass('public.billing_subscriptions') IS NOT NULL AND to_regclass('public.billing_credit_ledger') IS NOT NULL" ;;
  031) VERIFY_SQL="SELECT to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL AND to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL" ;;
  032) VERIFY_SQL="SELECT position('FROM public.business_profiles bb' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
    AND position(\$needle\$b.trust_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
    AND position(\$needle\$b.moderation_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0" ;;
  033) VERIFY_SQL="SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='admin_roles'
      AND c.conname='admin_roles_role_check'
      AND pg_get_constraintdef(c.oid) LIKE '%billing_admin%'
  )" ;;
  034) VERIFY_SQL="SELECT to_regclass('public.food_promo_codes') IS NOT NULL
    AND to_regclass('public.food_promo_claims') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fulfillment_orders' AND column_name='discount_amount'
    )" ;;
esac

verified="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$VERIFY_SQL")"
test "$verified" = 't' || {
  echo "ERROR: MIGRATION_${MIGRATION_NUMBER}_POSTCONDITION_FAILED" >&2
  exit 1
}

echo "MIGRATION_${MIGRATION_NUMBER}_APPLIED_AND_VERIFIED"
