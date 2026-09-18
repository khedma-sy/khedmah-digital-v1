#!/bin/sh
set -eu

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 1; }
test -n "${EXPECTED_RUNTIME_USER:-}" || { echo 'ERROR: EXPECTED_RUNTIME_USER is required.' >&2; exit 1; }

verified="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At   -v expected_user="$EXPECTED_RUNTIME_USER" <<'SQL'
SELECT CASE WHEN
  current_user = :'expected_user'
  AND NOT pg_has_role(current_user, 'cloudsqlsuperuser', 'member')
  AND pg_has_role(current_user, 'khedmah_runtime_role', 'member')
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole)
  )
  AND has_schema_privilege(current_user, 'public', 'USAGE')
  AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
  AND has_schema_privilege(current_user, 'khedmah_taxi', 'USAGE')
  AND NOT has_schema_privilege(current_user, 'khedmah_taxi', 'CREATE')
  AND has_table_privilege(current_user, 'public.core_user_accounts', 'SELECT')
  AND has_table_privilege(current_user, 'public.fulfillment_orders', 'INSERT')
  AND has_table_privilege(current_user, 'public.ad_listings', 'UPDATE')
THEN 'ready' ELSE 'unsafe' END;
SQL
)"
test "$verified" = ready || {
  echo 'ERROR: DATABASE_RUNTIME_ROLE_NOT_LEAST_PRIVILEGE' >&2
  exit 1
}
echo 'DATABASE_RUNTIME_LEAST_PRIVILEGE=TRUE'
