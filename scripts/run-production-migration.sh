#!/bin/sh
set -eu

readonly APPROVED_MIGRATION_021='021_provider_reports'
readonly APPROVED_SHA256_021='61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698'
readonly APPROVED_MIGRATION_022='022_expand_category_taxonomy'
readonly APPROVED_SHA256_022='f6a8f8dd9c64b6cdbeb6eda29e53be1d48884b922b8e9aa6f2a1dcc8a6830330'
readonly APPROVED_MIGRATION_024='024_product_store'
readonly APPROVED_SHA256_024='d2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6'
readonly APPROVED_MIGRATION_025='025_mobility_requests'
readonly APPROVED_SHA256_025='d87d7c172347c0ad2a60db7894b4abfc49ca5eff726a16174171da2f8bd43243'

case "${MIGRATION_VERSION:-}" in
  "$APPROVED_MIGRATION_021")
    APPROVED_SHA256="$APPROVED_SHA256_021"
    MIGRATION_FILE='/migrations/021_provider_reports.sql'
    ;;
  "$APPROVED_MIGRATION_022")
    APPROVED_SHA256="$APPROVED_SHA256_022"
    MIGRATION_FILE='/migrations/022_expand_category_taxonomy.sql'
    ;;
  "$APPROVED_MIGRATION_024")
    APPROVED_SHA256="$APPROVED_SHA256_024"
    MIGRATION_FILE='/migrations/024_product_store.sql'
    ;;
  "$APPROVED_MIGRATION_025")
    APPROVED_SHA256="$APPROVED_SHA256_025"
    MIGRATION_FILE='/migrations/025_mobility_requests.sql'
    ;;
  *)
    echo "ERROR: Only ${APPROVED_MIGRATION_021}, ${APPROVED_MIGRATION_022}, ${APPROVED_MIGRATION_024}, or ${APPROVED_MIGRATION_025} is approved by this image." >&2
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

if [ "$MIGRATION_VERSION" = "$APPROVED_MIGRATION_025" ]; then
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-migration', 0));
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_025_REQUIRES_SCHEMA_024';
  END IF;
  IF to_regclass(current_schema() || '.mobility_requests') IS NOT NULL
    OR to_regclass(current_schema() || '.mobility_request_events') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_025_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE required_column text;
BEGIN
  IF to_regclass(current_schema() || '.mobility_requests') IS NULL
    OR to_regclass(current_schema() || '.mobility_request_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_025_TABLE_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY['rider_user_id','provider_business_id','service_type','pickup_address','destination_address','rider_contact_phone','status','idempotency_key'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='mobility_requests' AND column_name=required_column) THEN
      RAISE EXCEPTION 'MIGRATION_025_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND tablename='mobility_requests' AND indexname='mobility_requests_one_open_per_rider_idx')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND tablename='mobility_request_events' AND indexname='mobility_request_events_request_time_idx') THEN
    RAISE EXCEPTION 'MIGRATION_025_INDEX_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='mobility_requests' AND c.conname='mobility_requests_rider_idempotency_unique') THEN
    RAISE EXCEPTION 'MIGRATION_025_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL
  printf '%s\n' 'MIGRATION_025_APPLIED_AND_VERIFIED'
  exit 0
fi

if [ "$MIGRATION_VERSION" = "$APPROVED_MIGRATION_024" ]; then
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-migration', 0));
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_REQUIRES_SCHEMA_022';
  END IF;
  IF to_regclass(current_schema() || '.product_listings') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_TABLE_POSTCONDITION_FAILED';
  END IF;
  FOREACH required_column IN ARRAY ARRAY[
    'business_profile_id', 'owner_user_id', 'title_ar', 'price', 'currency',
    'category_code', 'availability', 'status', 'moderation_status'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'product_listings'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_024_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'product_listings'
      AND indexname = 'product_listings_public_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_024_INDEX_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'media_assets'
      AND c.conname = 'media_assets_owner_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%product_listing%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'media_assets'
      AND c.conname = 'media_assets_asset_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%product_image%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_024_MEDIA_CONSTRAINT_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

  printf '%s\n' 'MIGRATION_024_APPLIED_AND_VERIFIED'
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
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'categories'
        AND column_name IN ('parent_code', 'visual_key', 'search_aliases_ar', 'search_aliases_en', 'is_featured')
    )
    OR to_regclass(current_schema() || '.product_listings') IS NOT NULL
  THEN
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
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_BEFORE_IMAGE_POSTCONDITION_FAILED';
  END IF;
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
  IF EXISTS (
    SELECT 1 FROM categories
    WHERE status = 'active'
      AND parent_code IS NULL
      AND code NOT IN (
        'home_maintenance', 'food_hospitality', 'health_medical', 'education_training',
        'professional_services', 'beauty_personal_care', 'retail_shopping', 'automotive',
        'transport_logistics', 'technology_digital', 'construction_real_estate',
        'events_occasions', 'agriculture_livestock', 'industrial_supply', 'travel_tourism'
      )
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_NONCANONICAL_ACTIVE_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

printf '%s\n' 'MIGRATION_022_APPLIED_AND_VERIFIED'
