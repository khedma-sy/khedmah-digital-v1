#!/bin/sh
set -eu

readonly APPROVED_SHA256='d2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6'
readonly MIGRATION_FILE='/migrations/024_product_store.sql'

environment="${DEPLOYMENT_ENVIRONMENT:-}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Product Store migration 024 is allowed only in preview or staging.' >&2; exit 2 ;;
esac

test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing Product Store migration 024 against Production.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || { echo 'ERROR: Migration 024 approval checksum does not match.' >&2; exit 3; }
printf '%s  %s\n' "$APPROVED_SHA256" "$MIGRATION_FILE" | sha256sum -c - >/dev/null

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

taxonomy_022="$(psql_scalar "SELECT (to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL)::int" 2>/dev/null)" || exit 49
media_assets="$(psql_scalar "SELECT (to_regclass(current_schema() || '.media_assets') IS NOT NULL)::int" 2>/dev/null)" || exit 49
product_listings="$(psql_scalar "SELECT (to_regclass(current_schema() || '.product_listings') IS NOT NULL)::int" 2>/dev/null)" || exit 49

[ "$taxonomy_022" = '1' ] || { echo 'ERROR: MIGRATION_024_REQUIRES_SCHEMA_022' >&2; exit 41; }
[ "$media_assets" = '1' ] || { echo 'ERROR: MIGRATION_024_REQUIRES_MEDIA_ASSETS' >&2; exit 42; }

verify_024() {
  table_count="$(psql_scalar "SELECT (to_regclass(current_schema() || '.product_listings') IS NOT NULL)::int" 2>/dev/null)" || return 49
  [ "$table_count" = '1' ] || return 43

  column_count="$(psql_scalar "SELECT count(*)::int FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='product_listings' AND column_name IN ('business_profile_id','owner_user_id','title_ar','price','currency','category_code','availability','status','moderation_status')" 2>/dev/null)" || return 49
  [ "$column_count" = '9' ] || return 44

  index_count="$(psql_scalar "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND tablename='product_listings' AND indexname='product_listings_public_idx'" 2>/dev/null)" || return 49
  [ "$index_count" = '1' ] || return 45

  media_count="$(psql_scalar "SELECT ((EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_owner_type_check' AND pg_get_constraintdef(c.oid) LIKE '%product_listing%'))::int + (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check' AND pg_get_constraintdef(c.oid) LIKE '%product_image%'))::int)" 2>/dev/null)" || return 49
  [ "$media_count" = '2' ] || return 46
  return 0
}

if [ "$product_listings" = '1' ]; then
  verify_024 || exit $?
  echo "MIGRATION_024_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-product-store-024', 0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_REQUIRES_SCHEMA_022';
  END IF;
  IF to_regclass(current_schema() || '.media_assets') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_REQUIRES_MEDIA_ASSETS';
  END IF;
  IF to_regclass(current_schema() || '.product_listings') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$guard\$;
\ir ${MIGRATION_FILE}
COMMIT;
SQL

verify_024 || exit $?
echo "MIGRATION_024_APPLIED_AND_VERIFIED:${environment}:${project}"
