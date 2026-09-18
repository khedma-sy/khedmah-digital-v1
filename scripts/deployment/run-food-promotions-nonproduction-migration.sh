#!/bin/sh
set -eu

readonly DEFAULT_MIGRATION_FILE='/migrations/034_food_order_promotions.sql'
readonly APPROVED_SHA256='127206eb637c285b5fe8ed7bba389360562288e27cc3379d22596fb7dc2ac2dd'

migration_file="${FOOD_PROMOTIONS_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in preview|staging) ;; *) exit 61 ;; esac
case "$mode" in verify|apply) ;; *) exit 62 ;; esac
test -n "$project" || exit 63
test -n "$production_project" || exit 64
if [ "$project" = "$production_project" ]; then
  echo 'Refusing food promotion migration 034 against the production project.' >&2
  exit 65
fi
test -n "${DATABASE_URL:-}" || exit 66
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || exit 67
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_034_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || exit 68
fi
printf '%s  %s\n' "$APPROVED_SHA256" "$migration_file" | sha256sum -c - >/dev/null 2>&1 || exit 69

if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
  command -v python3 >/dev/null 2>&1 || exit 52
  set +e
  connection_exports="$(DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os, shlex
from urllib.parse import unquote, urlsplit
try:
    parsed=urlsplit(os.environ['DATABASE_URL'])
    if parsed.scheme not in ('postgres','postgresql'):
        raise ValueError('unsupported scheme')
    database=unquote(parsed.path[1:] if parsed.path.startswith('/') else parsed.path)
    if not database:
        raise ValueError('database required')
    for name,value in {'PGDATABASE':database,'PGUSER':unquote(parsed.username or ''),'PGPASSWORD':unquote(parsed.password or '')}.items():
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

psql_exec() { if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then psql -d "$PGDATABASE" "$@"; else psql -d "$DATABASE_URL" "$@"; fi; }
psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50
psql_scalar() { psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
probe_count() {
  value="$(psql_scalar "$1" 2>/dev/null)" || return 49
  case "$value" in *[!0-9]*|'') return 51 ;; esac
  printf '%s' "$value"
}

predecessor_state() {
  probe_count "SELECT ((to_regclass('public.core_user_accounts') IS NOT NULL)::int + (to_regclass('public.business_profiles') IS NOT NULL)::int + (to_regclass('public.product_listings') IS NOT NULL)::int + (to_regclass('public.fulfillment_orders') IS NOT NULL)::int)"
}
promotion_state() {
  probe_count "SELECT ((to_regclass('public.food_promo_codes') IS NOT NULL)::int + (to_regclass('public.food_promo_claims') IS NOT NULL)::int + (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='fulfillment_orders' AND column_name IN ('food_promo_id','promo_code','discount_amount')) + (SELECT count(*)::int FROM pg_constraint WHERE conrelid=to_regclass('public.fulfillment_orders') AND conname IN ('fulfillment_orders_discount_amount_check','fulfillment_orders_promo_snapshot_check')) + (EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.fulfillment_orders') AND c.conname='fulfillment_orders_total_contract' AND pg_get_constraintdef(c.oid) LIKE '%discount_amount%'))::int + (to_regclass('public.food_promo_merchant_created_idx') IS NOT NULL)::int + (to_regclass('public.food_promo_active_window_idx') IS NOT NULL)::int + (to_regclass('public.food_promo_claim_limit_idx') IS NOT NULL)::int + (to_regclass('public.food_promo_claim_user_limit_idx') IS NOT NULL)::int)"
}

predecessor="$(predecessor_state)" || exit $?
[ "$predecessor" -eq 4 ] || { echo 'MIGRATION_034_REQUIRES_FULFILLMENT_026' >&2; exit 41; }
state="$(promotion_state)" || exit $?
if [ "$state" -eq 12 ]; then
  printf '%s\n' "MIGRATION_034_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi
if [ "$state" -ne 0 ]; then
  echo 'MIGRATION_034_PARTIAL_OR_UNVERIFIED_STATE' >&2
  exit 43
fi
if [ "$mode" = 'verify' ]; then exit 42; fi

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-food-promotions-034',0));
DO \$guard\$
BEGIN
  IF to_regclass('public.core_user_accounts') IS NULL
     OR to_regclass('public.business_profiles') IS NULL
     OR to_regclass('public.product_listings') IS NULL
     OR to_regclass('public.fulfillment_orders') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_034_REQUIRES_FULFILLMENT_026';
  END IF;
END
\$guard\$;
\ir $migration_file
COMMIT;
SQL

state="$(promotion_state)" || exit $?
[ "$state" -eq 12 ] || { echo 'MIGRATION_034_PARTIAL_OR_UNVERIFIED_STATE' >&2; exit 44; }
printf '%s\n' "MIGRATION_034_APPLIED_AND_VERIFIED:${environment}:${project}"
