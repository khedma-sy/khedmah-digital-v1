#!/bin/sh
set -eu

readonly DEFAULT_MIGRATION_FILE='/migrations/031_taxi_operational_approvals.sql'
readonly APPROVED_SHA256='148dfe66ee1a2c838225a14fe90dcac51e8c7a87ee56d277275142e20bcc6f5b'

migration_file="${TAXI_OPERATIONAL_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in preview|staging) ;; *) exit 61 ;; esac
case "$mode" in verify|apply) ;; *) exit 62 ;; esac
test -n "$project" || exit 63
test -n "$production_project" || exit 64
[ "$project" != "$production_project" ] || exit 65
test -n "${DATABASE_URL:-}" || exit 66
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || exit 67
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_031_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
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

schema_fingerprint() {
  predecessor="$(probe_count "SELECT ((to_regclass('public.core_user_accounts') IS NOT NULL)::int + (to_regclass('public.identity_sessions') IS NOT NULL)::int + (to_regclass('public.identity_credentials') IS NOT NULL)::int + (to_regclass('public.profiles') IS NOT NULL)::int + (to_regclass('public.business_profiles') IS NOT NULL)::int + (to_regclass('public.media_assets') IS NOT NULL)::int + (to_regclass('public.mobility_document_reviews') IS NOT NULL)::int)")" || return $?
  schema_count="$(probe_count "SELECT count(*)::int FROM pg_namespace WHERE nspname='khedmah_taxi'")" || return $?
  table_count="$(probe_count "SELECT ((to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL)::int + (to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL)::int + (to_regclass('khedmah_taxi.operational_approval_events') IS NOT NULL)::int)")" || return $?
  function_count="$(probe_count "SELECT ((to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NOT NULL)::int + (to_regprocedure('khedmah_taxi.reject_operational_approval_event_mutation()') IS NOT NULL)::int)")" || return $?
  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='khedmah_taxi' AND c.relname='operational_approval_events' AND NOT t.tgisinternal AND t.tgname='taxi_operational_approval_events_append_only'")" || return $?
  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname='khedmah_taxi' AND indexname='taxi_operational_events_business_created_idx'")" || return $?
  printf '%s\n' "MIGRATION_031_FINGERPRINT:predecessor=${predecessor}:schema=${schema_count}:tables=${table_count}:functions=${function_count}:trigger=${trigger_count}:index=${index_count}"
}

schema_state() {
  predecessor="$(probe_count "SELECT ((to_regclass('public.core_user_accounts') IS NOT NULL)::int + (to_regclass('public.identity_sessions') IS NOT NULL)::int + (to_regclass('public.identity_credentials') IS NOT NULL)::int + (to_regclass('public.profiles') IS NOT NULL)::int + (to_regclass('public.business_profiles') IS NOT NULL)::int + (to_regclass('public.media_assets') IS NOT NULL)::int + (to_regclass('public.mobility_document_reviews') IS NOT NULL)::int)")" || return $?
  [ "$predecessor" -eq 7 ] || { printf '%s' 'missing_predecessor'; return 0; }
  schema_count="$(probe_count "SELECT count(*)::int FROM pg_namespace WHERE nspname='khedmah_taxi'")" || return $?
  table_count="$(probe_count "SELECT ((to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL)::int + (to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL)::int + (to_regclass('khedmah_taxi.operational_approval_events') IS NOT NULL)::int)")" || return $?
  function_count="$(probe_count "SELECT ((to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NOT NULL)::int + (to_regprocedure('khedmah_taxi.reject_operational_approval_event_mutation()') IS NOT NULL)::int)")" || return $?
  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='khedmah_taxi' AND c.relname='operational_approval_events' AND NOT t.tgisinternal AND t.tgname='taxi_operational_approval_events_append_only'")" || return $?
  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname='khedmah_taxi' AND indexname='taxi_operational_events_business_created_idx'")" || return $?
  total=$((schema_count + table_count + function_count + trigger_count + index_count))
  if [ "$total" -eq 0 ]; then printf '%s' 'not_applied'; return 0; fi
  if [ "$schema_count" -eq 1 ] && [ "$table_count" -eq 3 ] && [ "$function_count" -eq 2 ] && [ "$trigger_count" -eq 1 ] && [ "$index_count" -eq 1 ]; then
    printf '%s' 'verified'; return 0
  fi
  printf '%s' 'partial_or_unverified'
}

exit_for_state() {
  case "$1" in missing_predecessor) exit 41 ;; not_applied) exit 42 ;; partial_or_unverified) exit 44 ;; *) exit 48 ;; esac
}

state="$(schema_state)" || exit $?
if [ "$state" = 'verified' ]; then
  printf '%s\n' "MIGRATION_031_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi
if [ "$state" = 'partial_or_unverified' ]; then schema_fingerprint >&2 || true; fi
if [ "$mode" = 'verify' ]; then exit_for_state "$state"; fi
[ "$state" = 'not_applied' ] || exit_for_state "$state"

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-taxi-operational-031',0));
DO \$guard\$
BEGIN
  IF to_regclass('public.core_user_accounts') IS NULL
     OR to_regclass('public.identity_sessions') IS NULL
     OR to_regclass('public.identity_credentials') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.business_profiles') IS NULL
     OR to_regclass('public.media_assets') IS NULL
     OR to_regclass('public.mobility_document_reviews') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_031_REQUIRES_PREDECESSOR_SCHEMA';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='khedmah_taxi') THEN
    RAISE EXCEPTION 'MIGRATION_031_PARTIAL_OR_UNVERIFIED_STATE';
  END IF;
END
\$guard\$;
\ir $migration_file
COMMIT;
SQL

state="$(schema_state)" || exit $?
[ "$state" = 'verified' ] || { schema_fingerprint >&2 || true; exit_for_state "$state"; }
printf '%s\n' "MIGRATION_031_APPLIED_AND_VERIFIED:${environment}:${project}"
