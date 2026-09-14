#!/bin/sh
set -eu

readonly MIGRATION_VERSION='030_billing_credits_subscriptions'
readonly DEFAULT_MIGRATION_FILE='/migrations/030_billing_credits_subscriptions.sql'
readonly APPROVED_SHA256='d758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194'
readonly APPROVED_GIT_BLOB='88795ee75d9948e5ecf85d8c2d53f6b77397b52b'

migration_file="${BILLING_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Billing migration 030 is allowed only in preview or staging.' >&2; exit 2 ;;
esac
case "$mode" in
  verify|apply) ;;
  *) echo 'ERROR: MIGRATION_MODE must be verify or apply.' >&2; exit 2 ;;
esac
test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing Billing migration 030 against the production project.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || { echo 'ERROR: Billing migration 030 approval checksum does not match.' >&2; exit 3; }
[ "${MIGRATION_GIT_BLOB:-}" = "$APPROVED_GIT_BLOB" ] || { echo 'ERROR: Billing migration 030 approval Git blob does not match.' >&2; exit 3; }
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_030_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || { echo 'ERROR: Explicit Billing migration 030 confirmation is required.' >&2; exit 3; }
fi
printf '%s  %s\n' "$APPROVED_SHA256" "$migration_file" | sha256sum -c - >/dev/null

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
    for name,value in {
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
  if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then psql -d "$PGDATABASE" "$@"; else psql -d "$DATABASE_URL" "$@"; fi
}
psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50
psql_scalar() { psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
probe_count() {
  value="$(psql_scalar "$1" 2>/dev/null)" || return 49
  case "$value" in *[!0-9]*|'') return 51 ;; esac
  printf '%s' "$value"
}

schema_state() {
  identity="$(probe_count "SELECT ((to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL)::int + (to_regclass(current_schema() || '.identity_sessions') IS NOT NULL)::int)")" || return $?
  [ "$identity" -eq 2 ] || { printf '%s' 'missing_identity'; return 0; }
  table_count="$(probe_count "SELECT count(*)::int FROM (VALUES ('billing_program_config'),('billing_plans'),('billing_promo_codes'),('billing_purchase_orders'),('billing_subscriptions'),('billing_credit_grants'),('billing_credit_ledger'),('billing_usage_rates'),('billing_usage_receipts'),('billing_promo_redemptions')) AS required(name) WHERE to_regclass(current_schema() || '.' || name) IS NOT NULL")" || return $?
  function_count="$(probe_count "SELECT ((to_regprocedure(current_schema() || '.reject_billing_ledger_mutation()') IS NOT NULL)::int + (to_regprocedure(current_schema() || '.grant_welcome_credit_on_login()') IS NOT NULL)::int)")" || return $?
  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal AND t.tgname IN ('billing_credit_ledger_no_rewrite','billing_usage_receipts_no_rewrite','billing_promo_redemptions_no_rewrite','billing_welcome_after_session')")" || return $?
  total=$((table_count + function_count + trigger_count))
  if [ "$total" -eq 0 ]; then printf '%s' 'not_applied'; return 0; fi
  if [ "$table_count" -eq 10 ] && [ "$function_count" -eq 2 ] && [ "$trigger_count" -eq 4 ]; then
    config="$(probe_count "SELECT count(*)::int FROM billing_program_config WHERE id='default' AND currency='SYP' AND currency_era='SYP_NEW_2026' AND welcome_points=100 AND welcome_expiry_days=30")" || return $?
    plans="$(probe_count "SELECT count(*)::int FROM billing_plans WHERE currency='SYP' AND currency_era='SYP_NEW_2026' AND published=true")" || return $?
    rates="$(probe_count "SELECT count(*)::int FROM billing_usage_rates WHERE active=true")" || return $?
    promo="$(probe_count "SELECT count(*)::int FROM billing_promo_codes WHERE code='KHEDMA30' AND percentage_off=30 AND per_user_limit=1")" || return $?
    if [ "$config" -eq 1 ] && [ "$plans" -eq 6 ] && [ "$rates" -eq 4 ] && [ "$promo" -eq 1 ]; then printf '%s' 'verified'; return 0; fi
  fi
  printf '%s' 'partial_or_unverified'
}

exit_for_state() {
  case "$1" in
    missing_identity) exit 41 ;;
    not_applied) exit 42 ;;
    partial_or_unverified) exit 44 ;;
    *) exit 48 ;;
  esac
}

state="$(schema_state)" || exit $?
if [ "$state" = 'verified' ]; then
  printf '%s\n' "MIGRATION_030_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi
if [ "$mode" = 'verify' ]; then exit_for_state "$state"; fi
[ "$state" = 'not_applied' ] || exit_for_state "$state"

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-030',0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.core_user_accounts') IS NULL OR to_regclass(current_schema() || '.identity_sessions') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_030_REQUIRES_IDENTITY_SCHEMA';
  END IF;
  IF to_regclass(current_schema() || '.billing_program_config') IS NOT NULL
     OR to_regclass(current_schema() || '.billing_plans') IS NOT NULL
     OR to_regclass(current_schema() || '.billing_purchase_orders') IS NOT NULL
     OR to_regprocedure(current_schema() || '.reject_billing_ledger_mutation()') IS NOT NULL
     OR to_regprocedure(current_schema() || '.grant_welcome_credit_on_login()') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_030_PARTIAL_OR_UNVERIFIED_STATE';
  END IF;
END
\$guard\$;
\ir $migration_file
COMMIT;
SQL

state="$(schema_state)" || exit $?
[ "$state" = 'verified' ] || exit_for_state "$state"
printf '%s\n' "MIGRATION_030_APPLIED_AND_VERIFIED:${environment}:${project}"
