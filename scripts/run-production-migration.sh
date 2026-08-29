#!/bin/sh
set -eu

readonly APPROVED_MIGRATION='022_expand_category_taxonomy'
readonly APPROVED_SHA256='ac385b1262a80a75d4443662fce2fb1a858ebd8778a2bc6fdec65d8c1c805a8a'
readonly MIGRATION_FILE='/migrations/022_expand_category_taxonomy.sql'

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
