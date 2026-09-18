#!/bin/sh
set -eu

readonly MIGRATION_VERSION='024_product_store'
readonly DEFAULT_MIGRATION_FILE='/migrations/024_product_store.sql'
readonly APPROVED_SHA256='d2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6'

migration_file="${PRODUCT_STORE_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Product Store migration 024 is allowed only in preview or staging.' >&2; exit 2 ;;
esac
case "$mode" in
  verify|apply) ;;
  *) echo 'ERROR: MIGRATION_MODE must be verify or apply.' >&2; exit 2 ;;
esac
test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing Product Store migration 024 against the production project.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || { echo 'ERROR: Migration 024 approval checksum does not match.' >&2; exit 3; }

if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_024_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || {
    echo 'ERROR: Explicit non-production migration 024 confirmation is required.' >&2
    exit 3
  }
fi

printf '%s  %s\n' "$APPROVED_SHA256" "$migration_file" | sha256sum -c - >/dev/null

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
  predecessor_count="$(probe_count "SELECT ((to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL)::int + (to_regclass(current_schema() || '.media_assets') IS NOT NULL)::int)")" || return $?
  if [ "$predecessor_count" -lt 2 ]; then
    printf '%s' 'missing_022'
    return 0
  fi

  table_count="$(probe_count "SELECT (to_regclass(current_schema() || '.product_listings') IS NOT NULL)::int")" || return $?
  media_count="$(probe_count "SELECT ((EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_owner_type_check' AND pg_get_constraintdef(c.oid) LIKE '%product_listing%'))::int + (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check' AND pg_get_constraintdef(c.oid) LIKE '%product_image%'))::int)")" || return $?

  if [ "$table_count" -eq 0 ] && [ "$media_count" -eq 0 ]; then
    printf '%s' 'not_applied'
    return 0
  fi
  if [ "$table_count" -ne 1 ] || [ "$media_count" -lt 2 ]; then
    printf '%s' 'partial'
    return 0
  fi

  column_count="$(probe_count "SELECT count(*)::int FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='product_listings' AND column_name IN ('business_profile_id','owner_user_id','title_ar','price','currency','category_code','availability','status','moderation_status')")" || return $?
  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND tablename='product_listings' AND indexname IN ('product_listings_owner_created_idx','product_listings_business_created_idx','product_listings_public_idx')")" || return $?

  if [ "$column_count" -lt 9 ] || [ "$index_count" -lt 3 ]; then
    printf '%s' 'partial'
    return 0
  fi

  printf '%s' 'verified'
}

exit_for_schema_state() {
  case "$1" in
    missing_022) echo 'MIGRATION_024_BLOCKED:MISSING_SCHEMA_022' >&2; exit 41 ;;
    not_applied) echo 'MIGRATION_024_NOT_APPLIED' >&2; exit 42 ;;
    partial) echo 'MIGRATION_024_PARTIAL_OR_UNVERIFIED_STATE' >&2; exit 43 ;;
    *) echo "MIGRATION_024_UNKNOWN_STATE:$1" >&2; exit 48 ;;
  esac
}

set +e
state="$(schema_state)"
state_status=$?
set -e
[ "$state_status" -eq 0 ] || exit "$state_status"

if [ "$state" = 'verified' ]; then
  printf '%s\n' "MIGRATION_024_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi

if [ "$mode" = 'verify' ]; then
  exit_for_schema_state "$state"
fi

[ "$state" = 'not_applied' ] || exit_for_schema_state "$state"

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-product-store-024', 0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL
    OR to_regclass(current_schema() || '.media_assets') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_024_REQUIRES_SCHEMA_022';
  END IF;
  IF to_regclass(current_schema() || '.product_listings') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema()
        AND t.relname='media_assets'
        AND c.conname IN ('media_assets_owner_type_check','media_assets_asset_type_check')
        AND (pg_get_constraintdef(c.oid) LIKE '%product_listing%' OR pg_get_constraintdef(c.oid) LIKE '%product_image%')
    )
  THEN
    RAISE EXCEPTION 'MIGRATION_024_PARTIAL_OR_UNVERIFIED_STATE';
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
[ "$state_status" -eq 0 ] || exit "$state_status"
[ "$state" = 'verified' ] || exit_for_schema_state "$state"
printf '%s\n' "MIGRATION_024_APPLIED_AND_VERIFIED:${environment}:${project}"
