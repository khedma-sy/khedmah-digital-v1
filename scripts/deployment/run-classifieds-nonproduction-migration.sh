#!/bin/sh
set -eu

readonly MIGRATION_VERSION='025_classifieds'
readonly DEFAULT_MIGRATION_FILE='/migrations/025_classifieds.sql'
readonly APPROVED_SHA256='0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d'

migration_file="${CLASSIFIEDS_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Classifieds migration 025 is allowed only in preview or staging.' >&2; exit 2 ;;
esac
case "$mode" in
  verify|apply) ;;
  *) echo 'ERROR: MIGRATION_MODE must be verify or apply.' >&2; exit 2 ;;
esac
test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing Classifieds migration 025 against the production project.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || { echo 'ERROR: Migration 025 approval checksum does not match.' >&2; exit 3; }
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_025_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || { echo 'ERROR: Explicit non-production migration confirmation is required.' >&2; exit 3; }
fi
printf '%s  %s\n' "$APPROVED_SHA256" "$migration_file" | sha256sum -c - >/dev/null

# Cloud Run exposes an attached Cloud SQL instance through a Unix socket.
# DATABASE_URL is the credential source only; its TCP host must not override
# /cloudsql/<instance>. This mirrors DatabasePool's Cloud Run connection policy.
if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
  command -v python3 >/dev/null 2>&1 || exit 52
  set +e
  connection_exports="$(DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os
import shlex
from urllib.parse import unquote, urlsplit

try:
    parsed = urlsplit(os.environ['DATABASE_URL'])
    if parsed.scheme not in ('postgres', 'postgresql'):
        raise ValueError('unsupported database URL scheme')
    database = unquote(parsed.path[1:] if parsed.path.startswith('/') else parsed.path)
    if not database:
        raise ValueError('database name is required')
    for name, value in {
        'PGDATABASE': database,
        'PGUSER': unquote(parsed.username or ''),
        'PGPASSWORD': unquote(parsed.password or ''),
    }.items():
        print(f"{name}={shlex.quote(value)}")
except Exception:
    raise SystemExit(1)
PY
)"
  parse_status=$?
  set -e
  [ "$parse_status" -eq 0 ] || exit 52
  eval "$connection_exports"
  export PGDATABASE PGUSER PGPASSWORD
  PGHOST="/cloudsql/${CLOUD_SQL_INSTANCE_CONNECTION_NAME}"
  PGSSLMODE=disable
  export PGHOST PGSSLMODE
fi

psql_exec() {
  if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
    psql -d "$PGDATABASE" "$@"
  else
    psql -d "$DATABASE_URL" "$@"
  fi
}

# Keep connection/authentication failure distinguishable from SQL/catalog probe failure.
psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50

psql_scalar() {
  psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"
}

probe_scalar() {
  value="$(psql_scalar "$1" 2>/dev/null)" || return 49
  [ -n "$value" ] || return 51
  printf '%s' "$value"
}

probe_count() {
  value="$(probe_scalar "$1")" || return $?
  case "$value" in
    *[!0-9]*|'') return 51 ;;
  esac
  printf '%s' "$value"
}

schema_state() {
  base_count="$(probe_count "SELECT ((to_regclass(current_schema() || '.product_listings') IS NOT NULL)::int + (to_regclass(current_schema() || '.media_assets') IS NOT NULL)::int)")" || return $?
  if [ "$base_count" -lt 2 ]; then
    printf '%s' 'missing_024'
    return 0
  fi

  table_count="$(probe_count "SELECT ((to_regclass(current_schema() || '.ad_listings') IS NOT NULL)::int + (to_regclass(current_schema() || '.ad_free_slots') IS NOT NULL)::int + (to_regclass(current_schema() || '.ad_request_receipts') IS NOT NULL)::int + (to_regclass(current_schema() || '.ad_moderation_events') IS NOT NULL)::int)")" || return $?
  function_count="$(probe_count "SELECT ((to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()') IS NOT NULL)::int + (to_regprocedure(current_schema() || '.protect_ad_listing_identity()') IS NOT NULL)::int + (to_regprocedure(current_schema() || '.reject_ad_audit_mutation()') IS NOT NULL)::int)")" || return $?
  media_count="$(probe_count "SELECT ((EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_owner_type_check' AND pg_get_constraintdef(c.oid) LIKE '%ad_listing%'))::int + (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check' AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'))::int)")" || return $?

  if [ "$table_count" -eq 0 ] && [ "$function_count" -eq 0 ] && [ "$media_count" -eq 0 ]; then
    printf '%s' 'not_applied'
    return 0
  fi
  if [ "$table_count" -lt 4 ]; then
    printf '%s' 'partial_tables'
    return 0
  fi

  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND indexname IN ('ad_listings_owner_created_idx','ad_listings_public_idx','ad_listings_pending_idx','ad_free_slots_owner_idx')")" || return $?
  if [ "$index_count" -lt 4 ]; then
    printf '%s' 'missing_indexes'
    return 0
  fi

  if [ "$function_count" -lt 3 ]; then
    printf '%s' 'missing_functions'
    return 0
  fi

  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal AND t.tgname IN ('ad_free_slot_limit_before_insert','ad_listing_identity_before_update','ad_free_slots_append_only','ad_request_receipts_append_only','ad_moderation_events_append_only')")" || return $?
  if [ "$trigger_count" -lt 5 ]; then
    printf '%s' 'missing_triggers'
    return 0
  fi

  if [ "$media_count" -lt 2 ]; then
    printf '%s' 'missing_media'
    return 0
  fi

  printf '%s' 'verified'
}

exit_for_schema_state() {
  case "$1" in
    missing_024) exit 41 ;;
    not_applied) exit 42 ;;
    partial_tables) exit 43 ;;
    missing_indexes) exit 44 ;;
    missing_triggers) exit 45 ;;
    missing_functions) exit 46 ;;
    missing_media) exit 47 ;;
    *) exit 48 ;;
  esac
}

set +e
state="$(schema_state)"
state_status=$?
set -e
if [ "$state_status" -ne 0 ]; then
  exit "$state_status"
fi

if [ "$state" = 'verified' ]; then
  printf '%s\n' "MIGRATION_025_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi

# Verify mode is intentionally read-only and exits before the migration transaction.
if [ "$mode" = 'verify' ]; then
  exit_for_schema_state "$state"
fi

[ "$state" = 'not_applied' ] || exit_for_schema_state "$state"

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-classifieds-025', 0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL
    OR to_regclass(current_schema() || '.media_assets') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_025_REQUIRES_SCHEMA_024';
  END IF;
  IF to_regclass(current_schema() || '.ad_listings') IS NOT NULL
    OR to_regclass(current_schema() || '.ad_free_slots') IS NOT NULL
    OR to_regclass(current_schema() || '.ad_request_receipts') IS NOT NULL
    OR to_regclass(current_schema() || '.ad_moderation_events') IS NOT NULL
    OR to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()') IS NOT NULL
    OR to_regprocedure(current_schema() || '.protect_ad_listing_identity()') IS NOT NULL
    OR to_regprocedure(current_schema() || '.reject_ad_audit_mutation()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets'
        AND c.conname IN ('media_assets_owner_type_check','media_assets_asset_type_check')
        AND (pg_get_constraintdef(c.oid) LIKE '%ad_listing%' OR pg_get_constraintdef(c.oid) LIKE '%ad_image%')
    )
  THEN
    RAISE EXCEPTION 'MIGRATION_025_PARTIAL_OR_UNVERIFIED_STATE';
  END IF;
END
\$guard\$;
\ir ${migration_file}
COMMIT;
SQL

set +e
state="$(schema_state)"
state_status=$?
set -e
if [ "$state_status" -ne 0 ]; then
  exit "$state_status"
fi
if [ "$state" != 'verified' ]; then
  exit_for_schema_state "$state"
fi
printf '%s\n' "MIGRATION_025_APPLIED_AND_VERIFIED:${environment}:${project}"
