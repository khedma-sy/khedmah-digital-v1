#!/bin/sh
set -eu

readonly APPROVED_SHA256='8ed732624b0baf5f5457d138692622214fe2d7b2dd556b79974d23bd0c76093b'
migration_file='/migrations/036_classifieds_rolling_publication_quota.sql'
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in preview|staging) ;; *) exit 2 ;; esac
case "$mode" in verify|apply) ;; *) exit 2 ;; esac
test -n "$project" && test -n "$production_project" && [ "$project" != "$production_project" ] || exit 3
test -n "${DATABASE_URL:-}" || exit 2
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || exit 3
if [ "$mode" = apply ]; then
  expected="APPLY_KHEDMAH_NONPROD_036_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected" ] || exit 3
fi
printf '%s  %s\n' "$APPROVED_SHA256" "$migration_file" | sha256sum -c - >/dev/null

if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
  exports="$(DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os, shlex
from urllib.parse import unquote, urlsplit
p=urlsplit(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or not p.path.strip('/'):
    raise SystemExit(1)
for k,v in {'PGDATABASE':unquote(p.path.strip('/')),'PGUSER':unquote(p.username or ''),'PGPASSWORD':unquote(p.password or '')}.items():
    print(f'{k}={shlex.quote(v)}')
PY
)" || exit 52
  eval "$exports"
  export PGDATABASE PGUSER PGPASSWORD
  PGHOST="/cloudsql/${CLOUD_SQL_INSTANCE_CONNECTION_NAME}"; PGSSLMODE=disable; export PGHOST PGSSLMODE
  psql_cmd="psql -d $PGDATABASE"
else
  psql_cmd="psql -d $DATABASE_URL"
fi

definition="$($psql_cmd -X -Atq -v ON_ERROR_STOP=1 -c "SELECT pg_get_functiondef(to_regprocedure('public.enforce_ad_free_slot_limit()'))" 2>/dev/null)" || exit 41
is_applied() { printf '%s' "$1" | grep -q "interval '24 hours'" && printf '%s' "$1" | grep -q "interval '7 days'"; }
if is_applied "$definition"; then echo "MIGRATION_036_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"; exit 0; fi
[ "$mode" = apply ] || exit 42

$psql_cmd -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-classifieds-036',0));
\ir ${migration_file}
COMMIT;
SQL
definition="$($psql_cmd -X -Atq -v ON_ERROR_STOP=1 -c "SELECT pg_get_functiondef(to_regprocedure('public.enforce_ad_free_slot_limit()'))")"
is_applied "$definition" || exit 43
echo "MIGRATION_036_APPLIED_AND_VERIFIED:${environment}:${project}"
