#!/bin/sh
set -eu

readonly MIGRATION_VERSION='029_taxi_pricing_revisions'
readonly DEFAULT_MIGRATION_FILE='/migrations/029_taxi_pricing_revisions.sql'
readonly APPROVED_SHA256='df9a7467f59f00e0167233901e6d7bb1e686994e8f97aec43696d53ac2d7870e'

migration_file="${TAXI_PRICING_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

# Cloud Run execution metadata exposes only the process exit code when the deployer
# cannot read container logs. Keep pre-schema failures distinct so an operator can
# diagnose the isolated non-production job without granting broader logging access.
# These codes disclose only which contract check failed; they never encode secret data.
case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Taxi pricing migration 029 is allowed only in preview or staging.' >&2; exit 61 ;;
esac
case "$mode" in
  verify|apply) ;;
  *) echo 'ERROR: MIGRATION_MODE must be verify or apply.' >&2; exit 62 ;;
esac
test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 63; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 64; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing Taxi pricing migration 029 against the production project.' >&2; exit 65; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 66; }
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || { echo 'ERROR: Migration 029 approval checksum does not match.' >&2; exit 67; }
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_029_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || { echo 'ERROR: Explicit Taxi pricing migration confirmation is required.' >&2; exit 68; }
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
  if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
    psql -d "$PGDATABASE" "$@"
  else
    psql -d "$DATABASE_URL" "$@"
  fi
}

psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50
psql_scalar() { psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
probe_count() {
  value="$(psql_scalar "$1" 2>/dev/null)" || return 49
  case "$value" in *[!0-9]*|'') return 51 ;; esac
  printf '%s' "$value"
}

schema_state() {
  base="$(probe_count "SELECT (to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL)::int")" || return $?
  [ "$base" -eq 1 ] || { printf '%s' 'missing_identity'; return 0; }
  table_count="$(probe_count "SELECT (to_regclass(current_schema() || '.taxi_pricing_revisions') IS NOT NULL)::int")" || return $?
  function_count="$(probe_count "SELECT (to_regprocedure(current_schema() || '.reject_taxi_pricing_revision_mutation()') IS NOT NULL)::int")" || return $?
  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='taxi_pricing_revisions' AND NOT t.tgisinternal AND t.tgname='taxi_pricing_revisions_append_only'")" || return $?
  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND indexname='taxi_pricing_revisions_zone_activated_idx'")" || return $?
  total=$((table_count + function_count + trigger_count + index_count))
  if [ "$total" -eq 0 ]; then printf '%s' 'not_applied'; return 0; fi
  if [ "$table_count" -eq 1 ] && [ "$function_count" -eq 1 ] && [ "$trigger_count" -eq 1 ] && [ "$index_count" -eq 1 ]; then
    unique_constraint="$(probe_count "SELECT (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='taxi_pricing_revisions' AND c.conname='taxi_pricing_revisions_zone_revision_unique'))::int")" || return $?
    ceiling_constraint="$(probe_count "SELECT (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='taxi_pricing_revisions' AND c.conname='taxi_pricing_revisions_amount_ceiling_check'))::int")" || return $?
    if [ "$unique_constraint" -eq 1 ] && [ "$ceiling_constraint" -eq 1 ]; then
      printf '%s' 'verified'
      return 0
    fi
  fi
  printf '%s' 'partial_or_unverified'
}

schema_fingerprint() {
  base="$(probe_count "SELECT (to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL)::int")" || return $?
  table_count="$(probe_count "SELECT (to_regclass(current_schema() || '.taxi_pricing_revisions') IS NOT NULL)::int")" || return $?
  function_count="$(probe_count "SELECT (to_regprocedure(current_schema() || '.reject_taxi_pricing_revision_mutation()') IS NOT NULL)::int")" || return $?
  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='taxi_pricing_revisions' AND NOT t.tgisinternal AND t.tgname='taxi_pricing_revisions_append_only'")" || return $?
  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND indexname='taxi_pricing_revisions_zone_activated_idx'")" || return $?
  unique_constraint="$(probe_count "SELECT (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='taxi_pricing_revisions' AND c.conname='taxi_pricing_revisions_zone_revision_unique'))::int")" || return $?
  ceiling_constraint="$(probe_count "SELECT (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='taxi_pricing_revisions' AND c.conname='taxi_pricing_revisions_amount_ceiling_check'))::int")" || return $?
  printf '%s\n' "MIGRATION_029_FINGERPRINT:identity=${base}:table=${table_count}:function=${function_count}:trigger=${trigger_count}:index=${index_count}:unique_constraint=${unique_constraint}:ceiling_constraint=${ceiling_constraint}"
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
  printf '%s\n' "MIGRATION_029_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi
if [ "$state" = 'partial_or_unverified' ]; then
  schema_fingerprint >&2 || echo 'MIGRATION_029_FINGERPRINT:unavailable' >&2
fi
if [ "$mode" = 'verify' ]; then exit_for_state "$state"; fi
[ "$state" = 'not_applied' ] || exit_for_state "$state"

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-taxi-pricing-029',0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.core_user_accounts') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_029_REQUIRES_IDENTITY_SCHEMA';
  END IF;
  IF to_regclass(current_schema() || '.taxi_pricing_revisions') IS NOT NULL
     OR to_regprocedure(current_schema() || '.reject_taxi_pricing_revision_mutation()') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_029_PARTIAL_OR_UNVERIFIED_STATE';
  END IF;
END
\$guard\$;
\ir $migration_file
COMMIT;
SQL

state="$(schema_state)" || exit $?
[ "$state" = 'verified' ] || { schema_fingerprint >&2 || true; exit_for_state "$state"; }
printf '%s\n' "MIGRATION_029_APPLIED_AND_VERIFIED:${environment}:${project}"
