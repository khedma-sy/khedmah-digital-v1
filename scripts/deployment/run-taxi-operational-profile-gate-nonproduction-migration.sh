#!/bin/sh
set -eu

readonly DEFAULT_MIGRATION_FILE='/migrations/032_taxi_operational_profile_gate.sql'
readonly APPROVED_SHA256='fd99e0cd9b3c7763ed938080f8526d7d7a38335343c6b2ec379bd2a35f3ad588'

migration_file="${TAXI_OPERATIONAL_PROFILE_GATE_MIGRATION_FILE:-$DEFAULT_MIGRATION_FILE}"
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
  expected_confirmation="APPLY_KHEDMAH_NONPROD_032_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
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
  probe_count "SELECT ((to_regclass('public.business_profiles') IS NOT NULL)::int + (to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL)::int + (to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL)::int + (to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NOT NULL)::int)"
}
hardening_state() {
  probe_count "SELECT CASE WHEN to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NULL THEN 0 ELSE ((position('FROM public.business_profiles bb' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0 AND position('b.visibility <> ''public''' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0 AND position('b.moderation_status <> ''approved''' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0 AND position('b.trust_status <> ''approved''' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0 AND position('b.status <> ''active''' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0 AND position('d.business_profile_id <> b.id' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0)::int) END"
}

predecessor="$(predecessor_state)" || exit $?
[ "$predecessor" -eq 4 ] || exit 41
hardened="$(hardening_state)" || exit $?
if [ "$hardened" -eq 1 ]; then
  printf '%s\n' "MIGRATION_032_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi
if [ "$mode" = 'verify' ]; then exit 42; fi

psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-taxi-operational-032',0));
DO \$guard\$
BEGIN
  IF to_regclass('public.business_profiles') IS NULL
     OR to_regclass('khedmah_taxi.vehicle_approvals') IS NULL
     OR to_regclass('khedmah_taxi.driver_approvals') IS NULL
     OR to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_032_REQUIRES_031';
  END IF;
END
\$guard\$;
\ir $migration_file
COMMIT;
SQL

hardened="$(hardening_state)" || exit $?
[ "$hardened" -eq 1 ] || exit 44
printf '%s\n' "MIGRATION_032_APPLIED_AND_VERIFIED:${environment}:${project}"
