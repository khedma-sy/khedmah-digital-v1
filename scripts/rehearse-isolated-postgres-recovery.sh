#!/usr/bin/env bash
# Synthetic PostgreSQL recovery/least-privilege rehearsal on GitHub's ephemeral runner.
# NEVER connect to shared Preview/Production or claim this is a Cloud SQL restore.
set -euo pipefail

stop() { printf 'STOP: %s\n' "$1" >&2; exit 1; }
test "$GITHUB_ACTIONS" = true || stop "GITHUB_HOSTED_CI_ONLY"
test "$GITHUB_EVENT_NAME" = pull_request || stop "PULL_REQUEST_ONLY"
test "$GITHUB_REPOSITORY" = khedma-sy/khedmah-digital-v1 || stop "REPOSITORY_SCOPE"
test "$RUNNER_ENVIRONMENT" = github-hosted || stop "EPHEMERAL_RUNNER_REQUIRED"
test "$RUNNER_OS" = Linux || stop "LINUX_REQUIRED"
test -n "$RUNNER_TEMP" || stop "TEMP_REQUIRED"
test "$PGPASSWORD" = local_recovery_ci_only_password || stop "UNEXPECTED_CI_DB_PASSWORD"
test -z "$DATABASE_URL" || stop "SHARED_DATABASE_URL_FORBIDDEN"
test -z "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" || stop "CLOUD_SQL_FORBIDDEN"
test -z "$GOOGLE_APPLICATION_CREDENTIALS" || stop "GOOGLE_CREDENTIALS_FORBIDDEN"
test -z "$DOCKER_HOST" || stop "REMOTE_DOCKER_HOST_FORBIDDEN"
test -z "$DOCKER_CONTEXT" || stop "CUSTOM_DOCKER_CONTEXT_FORBIDDEN"

source_db=khedmah_recovery_source_test
target_db=khedmah_recovery_target_test
test "$source_db" != "$target_db" || stop "RESTORE_TARGET_MUST_BE_SEPARATE"
[[ "$source_db" == *_test && "$target_db" == *_test ]] || stop "TEST_DB_NAME_REQUIRED"
work=$(mktemp -d "$RUNNER_TEMP/khedmah-recovery-XXXXXXXX")
trap 'rm -rf "$work"' EXIT

# The client image matches the ephemeral service's major PostgreSQL version.
# Hardcoded loopback TCP, fixed disposable user, no cloud socket/network credentials.
pg() {
  docker run --rm -i --network host \
    --env PGHOST=127.0.0.1 --env PGPORT=5432 \
    --env PGUSER=recovery_ci --env PGPASSWORD \
    --mount "type=bind,src=$work,dst=/artifacts" \
    postgres:16-alpine "$@"
}
reader() {
  docker run --rm -i --network host \
    --env PGHOST=127.0.0.1 --env PGPORT=5432 \
    --env PGUSER=recovery_readonly --env PGPASSWORD=synthetic_readonly_only \
    postgres:16-alpine "$@"
}
signature() {
  pg psql -XAt -v ON_ERROR_STOP=1 -d "$1" -c "
    SELECT
      (SELECT count(*)::text FROM recovery_orders) || ':' ||
      (SELECT coalesce(sum(total),0)::text FROM recovery_orders) || ':' ||
      (SELECT md5(string_agg(id || '/' || status || '/' || total || '/' || currency,
             ',' ORDER BY id)) FROM recovery_orders) || ':' ||
      (SELECT count(*)::text FROM recovery_events) || ':' ||
      (SELECT count(*)::text FROM recovery_claims);
  "
}

# Seed only our explicit source fixture database, created by this job's container.
pg psql -X -v ON_ERROR_STOP=1 -d "$source_db" <<'SQL'
CREATE TABLE recovery_orders (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('quoted','merchant_confirmed')),
  total numeric(14,2) NOT NULL CHECK (total > 0),
  currency text NOT NULL CHECK (currency IN ('SYP','USD')),
  updated_at timestamptz NOT NULL
);
CREATE TABLE recovery_events (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES recovery_orders(id),
  event_type text NOT NULL
);
CREATE TABLE recovery_claims (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES recovery_orders(id),
  status text NOT NULL CHECK (status IN ('applied','redeemed'))
);
INSERT INTO recovery_orders VALUES
  ('synthetic-1','quoted',1100,'SYP','2026-11-11T12:00:00Z'),
  ('synthetic-2','merchant_confirmed',2500,'SYP','2026-11-11T12:05:00Z');
INSERT INTO recovery_events VALUES ('event-1','synthetic-2','confirmed');
INSERT INTO recovery_claims VALUES ('claim-1','synthetic-1','applied');
SQL

before=$(signature "$source_db")
test -n "$before" || stop "SOURCE_SIGNATURE_MISSING"
pg pg_dump --format=custom --no-owner --no-acl --dbname="$source_db" --file=/artifacts/snapshot.dump
test -s "$work/snapshot.dump" || stop "BACKUP_ARCHIVE_EMPTY"
backup_sha256=$(sha256sum "$work/snapshot.dump" | awk '{print $1}')
restore_started=$(date +%s)

# Create and restore exclusively into a second, initially empty disposable DB.
pg createdb --maintenance-db=postgres "$target_db"
pg pg_restore --exit-on-error --no-owner --no-acl --dbname="$target_db" /artifacts/snapshot.dump
restore_seconds=$(( $(date +%s) - restore_started ))

restored=$(signature "$target_db")
test "$before" = "$restored" || stop "RESTORED_CONTENT_MISMATCH"

# Verify that restore did not mutate its source; backup captures a bounded point.
test "$before" = "$(signature "$source_db")" || stop "RESTORE_TOUCHED_SOURCE"

# A post-snapshot source write MUST NOT magically appear in the recovered target.
pg psql -X -v ON_ERROR_STOP=1 -d "$source_db" -c "
  INSERT INTO recovery_orders VALUES
  ('post-snapshot','quoted',300,'SYP','2026-11-11T12:10:00Z');
" >/dev/null
test "$before" = "$(signature "$target_db")" || stop "SNAPSHOT_RPO_BOUNDARY_BROKEN"

# Transaction rollback on the recovered target must leave all rows unchanged.
pg psql -X -v ON_ERROR_STOP=1 -d "$target_db" -c "
  BEGIN;
  UPDATE recovery_orders SET status='merchant_confirmed' WHERE id='synthetic-1';
  ROLLBACK;
" >/dev/null
test "$before" = "$(signature "$target_db")" || stop "ROLLBACK_FAILED"

# Local role separation: a read-only principal can SELECT but cannot INSERT.
pg psql -X -v ON_ERROR_STOP=1 -d "$target_db" -c "
  CREATE ROLE recovery_readonly LOGIN PASSWORD 'synthetic_readonly_only';
  REVOKE ALL ON DATABASE khedmah_recovery_target_test FROM PUBLIC;
  GRANT CONNECT ON DATABASE khedmah_recovery_target_test TO recovery_readonly;
  GRANT USAGE ON SCHEMA public TO recovery_readonly;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO recovery_readonly;
" >/dev/null
test "$(reader psql -XAt -v ON_ERROR_STOP=1 -d "$target_db" -c 'SELECT count(*) FROM recovery_orders')" = 2 \
  || stop "READER_SELECT_FAILED"
if reader psql -X -v ON_ERROR_STOP=1 -d "$target_db" -c "
  INSERT INTO recovery_orders VALUES ('forbidden','quoted',1,'SYP',now());
" >"$work/denial.log" 2>&1; then
  stop "READER_INSERT_UNEXPECTEDLY_SUCCEEDED"
fi
grep -qi 'permission denied' "$work/denial.log" || stop "READER_WRITE_FAILURE_UNEXPECTED"
test "$before" = "$(signature "$target_db")" || stop "READER_CHANGED_RECOVERED_DATA"

# Synthetic fixture evidence only. Never classify a live Cloud SQL backup or
# production writer fence from an ephemeral GitHub Actions database.
printf '{"stage":"SYNTHETIC_POSTGRES_RECOVERY_CI","source":"ephemeral_local_test","target":"separate_ephemeral_local_test","archive_sha256":"%s","restore_seconds":%d,"snapshot_integrity":true,"source_unchanged":true,"post_snapshot_write_excluded":true,"rollback_verified":true,"reader_write_denied":true,"cloud_sql_backup_restored":false,"cloud_sql_writer_isolation_verified":false,"production_readiness_verified":false,"release_authorized":false}\n' \
  "$backup_sha256" "$restore_seconds"
