#!/bin/sh
set -eu

PHASE="${DATABASE_ROLE_PHASE:-}"
RUNTIME_USER="${DATABASE_RUNTIME_USER:-khedmah_app}"
MIGRATION_USER="${DATABASE_MIGRATION_USER:-khedmah_migrator}"
RUNTIME_ROLE="${DATABASE_RUNTIME_ROLE:-khedmah_runtime_role}"
MIGRATION_ROLE="${DATABASE_MIGRATION_ROLE:-khedmah_migration_role}"
DATABASE_NAME="${DATABASE_NAME:-khedmah}"

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }

for identifier in "$RUNTIME_USER" "$MIGRATION_USER" "$RUNTIME_ROLE" "$MIGRATION_ROLE" "$DATABASE_NAME"; do
  printf '%s' "$identifier" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || {
    echo "ERROR: invalid PostgreSQL identifier." >&2
    exit 2
  }
done

verify_isolation_sql="
SELECT CASE WHEN
  NOT pg_has_role('$RUNTIME_USER','cloudsqlsuperuser','member')
  AND NOT pg_has_role('$MIGRATION_USER','cloudsqlsuperuser','member')
  AND pg_has_role('$RUNTIME_USER','$RUNTIME_ROLE','member')
  AND pg_has_role('$MIGRATION_USER','$MIGRATION_ROLE','member')
  AND NOT (SELECT rolcreatedb FROM pg_roles WHERE rolname='$RUNTIME_USER')
  AND NOT (SELECT rolcreaterole FROM pg_roles WHERE rolname='$RUNTIME_USER')
  AND NOT (SELECT rolcreatedb FROM pg_roles WHERE rolname='$MIGRATION_USER')
  AND NOT (SELECT rolcreaterole FROM pg_roles WHERE rolname='$MIGRATION_USER')
THEN 'ready' ELSE 'blocked' END"

case "$PHASE" in
  prepare)
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-database-role-bootstrap', 0));
DO \$roles\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RUNTIME_ROLE') THEN
    EXECUTE 'CREATE ROLE "$RUNTIME_ROLE" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$MIGRATION_ROLE') THEN
    EXECUTE 'CREATE ROLE "$MIGRATION_ROLE" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION';
  END IF;
END
\$roles\$;
ALTER ROLE "$RUNTIME_ROLE" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION;
ALTER ROLE "$MIGRATION_ROLE" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION;
ALTER ROLE "$RUNTIME_USER" NOCREATEDB NOCREATEROLE INHERIT;
ALTER ROLE "$MIGRATION_USER" NOCREATEDB NOCREATEROLE INHERIT;
GRANT CONNECT ON DATABASE "$DATABASE_NAME" TO "$RUNTIME_ROLE", "$MIGRATION_ROLE";
GRANT CREATE ON DATABASE "$DATABASE_NAME" TO "$MIGRATION_ROLE";
GRANT USAGE, CREATE ON SCHEMA public TO "$MIGRATION_ROLE";
COMMIT;
SQL
    echo 'DATABASE_ROLE_PREPARE_COMPLETE'
    ;;
  verify)
    state="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$verify_isolation_sql")"
    test "$state" = ready || {
      echo 'ERROR: DATABASE_ROLE_ISOLATION_NOT_READY' >&2
      exit 7
    }
    echo 'DATABASE_ROLE_ISOLATION_VERIFIED'
    ;;
  harden)
    state="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$verify_isolation_sql")"
    test "$state" = ready || {
      echo 'ERROR: DATABASE_ROLE_ISOLATION_NOT_READY' >&2
      exit 7
    }
    canonical="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.food_promo_codes') IS NOT NULL AND to_regclass('public.fulfillment_orders') IS NOT NULL AND to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL")"
    test "$canonical" = t || {
      echo 'ERROR: RUNTIME_HARDENING_REQUIRES_CANONICAL_034' >&2
      exit 8
    }
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-runtime-hardening', 0));

REVOKE CREATE ON DATABASE "$DATABASE_NAME" FROM PUBLIC;
REVOKE CREATE ON DATABASE "$DATABASE_NAME" FROM "$RUNTIME_ROLE";
GRANT CONNECT ON DATABASE "$DATABASE_NAME" TO "$RUNTIME_ROLE";
GRANT CONNECT, CREATE ON DATABASE "$DATABASE_NAME" TO "$MIGRATION_ROLE";

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM "$RUNTIME_ROLE";
GRANT USAGE ON SCHEMA public TO "$RUNTIME_ROLE";
GRANT USAGE, CREATE ON SCHEMA public TO "$MIGRATION_ROLE";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "$RUNTIME_ROLE";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "$RUNTIME_ROLE";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "$RUNTIME_ROLE";

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "$RUNTIME_ROLE";

REVOKE ALL ON SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";
GRANT USAGE ON SCHEMA khedmah_taxi TO "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";

-- Operational approval APIs run inside the application runtime but remain
-- constrained by application authorization and database review invariants.
GRANT SELECT, INSERT ON TABLE
  khedmah_taxi.driver_approvals,
  khedmah_taxi.vehicle_approvals
TO "$RUNTIME_ROLE";
GRANT UPDATE(
  business_profile_id, vehicle_id, zone_code, status, reviewed_by,
  verification_reference, decision_reason, approved_at, expires_at, revision, updated_at
) ON khedmah_taxi.driver_approvals TO "$RUNTIME_ROLE";
GRANT UPDATE(
  driver_user_id, status, reviewed_by, verification_reference, decision_reason,
  approved_at, expires_at, revision, updated_at
) ON khedmah_taxi.vehicle_approvals TO "$RUNTIME_ROLE";
GRANT INSERT ON TABLE khedmah_taxi.operational_approval_events TO "$RUNTIME_ROLE";

-- Native trip runtime: mirror the proven least-privilege contract from the
-- Taxi acceptance suite. No DELETE rights and no direct tariff/route mutation.
GRANT SELECT, INSERT ON TABLE
  khedmah_taxi.jt_quotes,
  khedmah_taxi.jt_receipts,
  khedmah_taxi.jt_events,
  khedmah_taxi.jt_outbox,
  khedmah_taxi.jt_cash_receipts,
  khedmah_taxi.jt_ride_consents
TO "$RUNTIME_ROLE";
GRANT UPDATE(consumed_order_id) ON khedmah_taxi.jt_quotes TO "$RUNTIME_ROLE";
GRANT SELECT, INSERT, UPDATE ON khedmah_taxi.jt_orders TO "$RUNTIME_ROLE";
GRANT SELECT, UPDATE(consumed_event_id) ON khedmah_taxi.jt_evidence TO "$RUNTIME_ROLE";
GRANT UPDATE(consumed_event_id) ON khedmah_taxi.jt_ride_consents TO "$RUNTIME_ROLE";

GRANT EXECUTE ON FUNCTION
  khedmah_taxi.resolve_actor_locked(TEXT, BOOLEAN),
  khedmah_taxi.read_tariff_locked(TEXT),
  khedmah_taxi.read_route_locked(TEXT, TEXT)
TO "$RUNTIME_ROLE";

COMMIT;
SQL

    post="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  has_schema_privilege('$RUNTIME_USER','public','USAGE')
  AND NOT has_schema_privilege('$RUNTIME_USER','public','CREATE')
  AND has_table_privilege('$RUNTIME_USER','public.core_user_accounts','SELECT')
  AND has_table_privilege('$RUNTIME_USER','public.core_user_accounts','INSERT')
  AND has_schema_privilege('$RUNTIME_USER','khedmah_taxi','USAGE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','SELECT')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','status','UPDATE')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','reviewed_by','UPDATE')
  AND NOT has_column_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','user_id','UPDATE')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.vehicle_approvals','status','UPDATE')
  AND NOT has_column_privilege('$RUNTIME_USER','khedmah_taxi.vehicle_approvals','id','UPDATE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.operational_approval_events','INSERT')
  AND has_function_privilege('$RUNTIME_USER','khedmah_taxi.resolve_actor_locked(text,boolean)','EXECUTE')
  AND has_function_privilege('$RUNTIME_USER','khedmah_taxi.read_tariff_locked(text)','EXECUTE')
  AND has_function_privilege('$RUNTIME_USER','khedmah_taxi.read_route_locked(text,text)','EXECUTE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_orders','SELECT')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_orders','INSERT')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_orders','UPDATE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_quotes','SELECT')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_quotes','INSERT')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.jt_quotes','consumed_order_id','UPDATE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_evidence','SELECT')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.jt_evidence','consumed_event_id','UPDATE')
  AND NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_events','DELETE')
  AND NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.jt_cash_receipts','DELETE')
  AND (
    to_regclass('khedmah_taxi.tariffs') IS NULL
    OR NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.tariffs','UPDATE')
  )
  AND (
    to_regclass('khedmah_taxi.routes') IS NULL
    OR NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.routes','UPDATE')
  )
THEN 'ready' ELSE 'blocked' END")"
    test "$post" = ready || {
      echo 'ERROR: RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED' >&2
      exit 9
    }
    echo 'RUNTIME_DATABASE_HARDENING_VERIFIED'
    ;;
  *)
    echo 'ERROR: DATABASE_ROLE_PHASE must be prepare, verify, or harden.' >&2
    exit 2
    ;;
esac
