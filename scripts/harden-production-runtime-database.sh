#!/bin/sh
set -eu

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 1; }

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khedmah_runtime_role') THEN
    CREATE ROLE khedmah_runtime_role
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO khedmah_runtime_role', current_database());
END
$$;

GRANT USAGE ON SCHEMA public, khedmah_taxi TO khedmah_runtime_role;
REVOKE CREATE ON SCHEMA public, khedmah_taxi FROM khedmah_runtime_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, khedmah_taxi TO khedmah_runtime_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, khedmah_taxi TO khedmah_runtime_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, khedmah_taxi TO khedmah_runtime_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO khedmah_runtime_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO khedmah_runtime_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO khedmah_runtime_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO khedmah_runtime_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi
  GRANT USAGE, SELECT ON SEQUENCES TO khedmah_runtime_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi
  GRANT EXECUTE ON FUNCTIONS TO khedmah_runtime_role;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='khedmah_runtime_role'
      AND rolcanlogin=false AND rolsuper=false
      AND rolcreatedb=false AND rolcreaterole=false
  ) THEN
    RAISE EXCEPTION 'RUNTIME_ROLE_ATTRIBUTES_INVALID';
  END IF;
  IF NOT has_schema_privilege('khedmah_runtime_role','public','USAGE')
    OR has_schema_privilege('khedmah_runtime_role','public','CREATE')
    OR NOT has_schema_privilege('khedmah_runtime_role','khedmah_taxi','USAGE')
    OR has_schema_privilege('khedmah_runtime_role','khedmah_taxi','CREATE')
  THEN
    RAISE EXCEPTION 'RUNTIME_SCHEMA_PRIVILEGES_INVALID';
  END IF;
  IF NOT has_table_privilege('khedmah_runtime_role','public.core_user_accounts','SELECT')
    OR NOT has_table_privilege('khedmah_runtime_role','public.fulfillment_orders','INSERT')
    OR NOT has_table_privilege('khedmah_runtime_role','public.ad_listings','UPDATE')
    OR NOT has_table_privilege('khedmah_runtime_role','public.billing_program_config','SELECT')
  THEN
    RAISE EXCEPTION 'RUNTIME_TABLE_PRIVILEGES_INVALID';
  END IF;
END
$verify$;
SQL

echo 'DATABASE_RUNTIME_ROLE_HARDENED=TRUE'
