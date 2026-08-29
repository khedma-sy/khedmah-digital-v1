#!/bin/sh
set -eu

readonly APPROVED_MIGRATION_021='021_provider_reports'
readonly APPROVED_SHA256_021='61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698'
readonly APPROVED_MIGRATION_022='022_expand_category_taxonomy'
readonly APPROVED_SHA256_022='ac385b1262a80a75d4443662fce2fb1a858ebd8778a2bc6fdec65d8c1c805a8a'

case "${MIGRATION_VERSION:-}" in
  "$APPROVED_MIGRATION_021")
    APPROVED_SHA256="$APPROVED_SHA256_021"
    MIGRATION_FILE='/migrations/021_provider_reports.sql'
    ;;
  "$APPROVED_MIGRATION_022")
    APPROVED_SHA256="$APPROVED_SHA256_022"
    MIGRATION_FILE='/migrations/022_expand_category_taxonomy.sql'
    ;;
  *)
    echo "ERROR: Only ${APPROVED_MIGRATION_021} or ${APPROVED_MIGRATION_022} is approved by this image." >&2
    exit 1
    ;;
esac
if [ "${MIGRATION_SHA256:-}" != "$APPROVED_SHA256" ]; then
  echo 'ERROR: Migration approval checksum does not match.' >&2
  exit 1
fi
test -n "${DATABASE_URL:-}"
printf '%s  %s\n' "$APPROVED_SHA256" "$MIGRATION_FILE" | sha256sum -c -

if [ "$MIGRATION_VERSION" = "$APPROVED_MIGRATION_021" ]; then
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
  exit 0
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-migration', 0));
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_REQUIRES_SCHEMA_021';
  END IF;
  IF to_regclass(current_schema() || '.organizations') IS NULL
    OR to_regclass(current_schema() || '.organization_members') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'categories'
      AND column_name IN ('parent_code', 'visual_key', 'search_aliases_ar', 'search_aliases_en', 'is_featured')
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  IF to_regclass(current_schema() || '.organizations') IS NULL
    OR to_regclass(current_schema() || '.organization_members') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY[
    'parent_code',
    'visual_key',
    'search_aliases_ar',
    'search_aliases_en',
    'is_featured'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'categories'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_022_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'categories'
      AND c.conname = 'categories_parent_code_fk'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'categories'
      AND indexname = 'categories_parent_public_order_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_INDEX_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE code = 'electrician' AND parent_code = 'home_maintenance')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'plumber' AND parent_code = 'home_maintenance')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'butcher' AND parent_code = 'food_hospitality')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'grocery' AND parent_code = 'food_hospitality')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'taxi' AND parent_code = 'transport_logistics')
    OR NOT EXISTS (SELECT 1 FROM categories WHERE code = 'delivery_courier' AND parent_code = 'transport_logistics')
  THEN
    RAISE EXCEPTION 'MIGRATION_022_TAXONOMY_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

printf '%s\n' 'MIGRATION_022_APPLIED_AND_VERIFIED'
