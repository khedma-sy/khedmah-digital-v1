#!/bin/sh
# Lab-only container entrypoint template. The operator pins and replaces the
# SQL marker before mounting this file as a secret. Do not run against any
# production or preview instance. This uses a reversible database-wide
# connection barrier; abnormal process loss may still need manual recovery.
set -u

marker=/tmp/khedmah-lab-fence-attempted
if [ "${PGDATABASE:-}" != khedmah ] || [ "${PGUSER:-}" != khedmah_migrator ] \
   || [ -z "${LAB_FENCE_ADMIN_PASSWORD:-}" ] || [ -e "$marker" ]; then
  echo 'STOP: LAB_FENCE_ENVIRONMENT_UNVERIFIED'
  exit 2
fi

admin_psql() {
  PGUSER=postgres PGPASSWORD="$LAB_FENCE_ADMIN_PASSWORD" PGDATABASE=postgres \
    psql -X -qAt -v ON_ERROR_STOP=1 "$@"
}

mode=${LAB_FENCE_MODE:-TRANSITION}
if [ "$mode" = RECOVER ]; then
  # Only the operator may request this mode, after verifying the baseline=true
  # marker from the exact completed transition execution.
  identity=$(admin_psql -c "SELECT CASE WHEN current_database()='postgres' AND session_user='postgres' AND current_setting('server_version_num')::integer BETWEEN 160000 AND 169999 AND EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname='khedmah' AND pg_catalog.pg_has_role(current_user,datdba,'USAGE')) THEN 'READY' ELSE 'NOT_READY' END") || exit 2
  if [ "$identity" != READY ] || ! admin_psql -c 'ALTER DATABASE khedmah ALLOW_CONNECTIONS true' >/dev/null || \
     [ "$(admin_psql -c "SELECT datallowconn FROM pg_catalog.pg_database WHERE datname='khedmah'")" != t ]; then
    echo 'LAB_FENCE_RESTORED=false'
    exit 2
  fi
  echo 'LAB_FENCE_RESTORED=true'
  exit 0
fi
if [ "$mode" != TRANSITION ]; then
  echo 'STOP: LAB_FENCE_MODE_UNEXPECTED'
  exit 2
fi

finish() {
  status=$1
  trap - EXIT HUP INT TERM
  if [ -e "$marker" ]; then
    if admin_psql -c 'ALTER DATABASE khedmah ALLOW_CONNECTIONS true' >/dev/null && \
       [ "$(admin_psql -c "SELECT datallowconn FROM pg_catalog.pg_database WHERE datname='khedmah'")" = t ]; then
      echo 'LAB_FENCE_RESTORED=true'
      rm -f -- "$marker"
    else
      echo 'LAB_FENCE_RESTORED=false'
      status=2
    fi
  else
    echo 'LAB_FENCE_NOT_ATTEMPTED=true'
  fi
  exit "$status"
}
trap 'finish $?' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Before making a change, confirm the separate admin connection can recover the
# database and that the original connection setting is true.
ready=$(admin_psql -c "SELECT CASE WHEN current_database()='postgres' AND session_user='postgres' AND current_setting('server_version_num')::integer BETWEEN 160000 AND 169999 AND EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname='khedmah' AND datallowconn AND pg_catalog.pg_has_role(current_user,datdba,'USAGE')) THEN 'READY' ELSE 'NOT_READY' END") || exit 2
if [ "$ready" != READY ]; then
  echo 'STOP: LAB_FENCE_ADMIN_OR_BASELINE_UNVERIFIED'
  exit 2
fi

psql -X -qAt -v ON_ERROR_STOP=1 <<'KHEDMA_LAB_PSQL'
DO $lab_fence_baseline$
BEGIN
  IF current_database() <> 'khedmah' OR session_user <> 'khedmah_migrator'
     OR current_user <> 'khedmah_migrator'
     OR (SELECT datallowconn FROM pg_catalog.pg_database WHERE datname='khedmah') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'LAB_FENCE_IDENTITY_OR_BASELINE_MISMATCH';
  END IF;
END $lab_fence_baseline$;
SELECT 'LAB_FENCE_BASELINE_TRUE=true';
\! touch /tmp/khedmah-lab-fence-attempted && PGUSER=postgres PGPASSWORD="$LAB_FENCE_ADMIN_PASSWORD" PGDATABASE=postgres psql -X -qAt -v ON_ERROR_STOP=1 -c 'ALTER DATABASE khedmah ALLOW_CONNECTIONS false' >/dev/null
\if :SHELL_ERROR
SELECT 1/0;
\endif
DO $lab_fence_guard$
DECLARE db_oid oid;
BEGIN
  SELECT oid INTO db_oid FROM pg_catalog.pg_database
    WHERE datname='khedmah' AND datallowconn IS false;
  IF db_oid IS NULL THEN RAISE EXCEPTION 'LAB_FENCE_NOT_ACTIVE'; END IF;
  -- PostgreSQL 16 holds this shared-object lock while a connection starts.
  -- Check startup locks before pg_stat_activity, then refuse existing sessions.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_locks
      WHERE locktype='object' AND classid='pg_catalog.pg_database'::regclass
        AND objid=db_oid AND objsubid=0 AND mode='RowExclusiveLock' AND granted
        AND pid IS DISTINCT FROM pg_catalog.pg_backend_pid()) THEN
    RAISE EXCEPTION 'LAB_CONNECTION_START_IN_PROGRESS';
  END IF;
  PERFORM pg_catalog.pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity
      WHERE datname='khedmah' AND pid IS DISTINCT FROM pg_catalog.pg_backend_pid()) THEN
    RAISE EXCEPTION 'LAB_OTHER_DATABASE_SESSION_PRESENT';
  END IF;
END $lab_fence_guard$;
__KHEDMA_CANONICAL_SQL__
KHEDMA_LAB_PSQL
exit $?
