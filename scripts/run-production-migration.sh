#!/bin/sh
set -eu

readonly APPROVED_MIGRATION='021_provider_reports'
readonly APPROVED_SHA256='61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698'
readonly MIGRATION_FILE="/migrations/${APPROVED_MIGRATION}.sql"

if [ "${MIGRATION_VERSION:-}" != "$APPROVED_MIGRATION" ]; then
  echo "ERROR: Only ${APPROVED_MIGRATION} is approved by this image." >&2
  exit 1
fi
if [ "${MIGRATION_SHA256:-}" != "$APPROVED_SHA256" ]; then
  echo 'ERROR: Migration approval checksum does not match.' >&2
  exit 1
fi
test -n "${DATABASE_URL:-}"
printf '%s  %s\n' "$APPROVED_SHA256" "$MIGRATION_FILE" | sha256sum -c -

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-migration', 0));
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_021_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_021_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY[
    'report_identifier',
    'reporter_user_identifier',
    'target_type',
    'business_profile_id',
    'professional_profile_identifier',
    'reason_code',
    'details',
    'status',
    'reviewed_by_user_identifier',
    'resolution_note',
    'created_at',
    'updated_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'provider_reports'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_021_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'provider_reports'
      AND c.conname = 'provider_reports_exactly_one_target_check'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_021_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'provider_reports'
      AND indexname = 'provider_reports_open_reporter_target_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_021_INDEX_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

printf '%s\n' 'MIGRATION_021_APPLIED_AND_VERIFIED'
