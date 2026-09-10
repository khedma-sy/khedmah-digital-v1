#!/bin/sh
set -eu

readonly MIGRATION_VERSION='025_classifieds'
readonly MIGRATION_FILE='/migrations/025_classifieds.sql'
readonly APPROVED_SHA256='0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d'

environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Classifieds migration 025 is allowed only in preview or staging.' >&2; exit 2 ;;
esac
case "$mode" in
  verify|apply) ;;
  *) echo 'ERROR: MIGRATION_MODE must be verify or apply.' >&2; exit 2 ;;
esac
test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing Classifieds migration 025 against the production project.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }
[ "${MIGRATION_SHA256:-}" = "$APPROVED_SHA256" ] || { echo 'ERROR: Migration 025 approval checksum does not match.' >&2; exit 3; }
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_025_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || { echo 'ERROR: Explicit non-production migration confirmation is required.' >&2; exit 3; }
fi
printf '%s  %s\n' "$APPROVED_SHA256" "$MIGRATION_FILE" | sha256sum -c - >/dev/null

verify_schema() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $verify$
DECLARE
  required_table text;
  required_index text;
  required_trigger text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY['ad_listings','ad_free_slots','ad_request_receipts','ad_moderation_events'] LOOP
    IF to_regclass(current_schema() || '.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'MIGRATION_025_TABLE_POSTCONDITION_FAILED: %', required_table;
    END IF;
  END LOOP;
  FOREACH required_index IN ARRAY ARRAY['ad_listings_owner_created_idx','ad_listings_public_idx','ad_listings_pending_idx','ad_free_slots_owner_idx'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname=required_index) THEN
      RAISE EXCEPTION 'MIGRATION_025_INDEX_POSTCONDITION_FAILED: %', required_index;
    END IF;
  END LOOP;
  FOREACH required_trigger IN ARRAY ARRAY['ad_free_slot_limit_before_insert','ad_listing_identity_before_update','ad_free_slots_append_only','ad_request_receipts_append_only','ad_moderation_events_append_only'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND t.tgname=required_trigger AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'MIGRATION_025_TRIGGER_POSTCONDITION_FAILED: %', required_trigger;
    END IF;
  END LOOP;
  IF to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()') IS NULL
    OR to_regprocedure(current_schema() || '.protect_ad_listing_identity()') IS NULL
    OR to_regprocedure(current_schema() || '.reject_ad_audit_mutation()') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_025_FUNCTION_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_owner_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%ad_listing%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_025_MEDIA_POSTCONDITION_FAILED';
  END IF;
END
$verify$;
SQL
}

if verify_schema; then
  printf '%s\n' "MIGRATION_025_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi

if [ "$mode" = 'verify' ]; then
  echo 'ERROR: Migration 025 is not fully applied in this non-production database.' >&2
  exit 4
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-classifieds-025', 0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL
    OR to_regclass(current_schema() || '.media_assets') IS NULL
  THEN
    RAISE EXCEPTION 'MIGRATION_025_REQUIRES_SCHEMA_024';
  END IF;
  IF to_regclass(current_schema() || '.ad_listings') IS NOT NULL
    OR to_regclass(current_schema() || '.ad_free_slots') IS NOT NULL
    OR to_regclass(current_schema() || '.ad_request_receipts') IS NOT NULL
    OR to_regclass(current_schema() || '.ad_moderation_events') IS NOT NULL
    OR to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()') IS NOT NULL
    OR to_regprocedure(current_schema() || '.protect_ad_listing_identity()') IS NOT NULL
    OR to_regprocedure(current_schema() || '.reject_ad_audit_mutation()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets'
        AND c.conname IN ('media_assets_owner_type_check','media_assets_asset_type_check')
        AND (pg_get_constraintdef(c.oid) LIKE '%ad_listing%' OR pg_get_constraintdef(c.oid) LIKE '%ad_image%')
    )
  THEN
    RAISE EXCEPTION 'MIGRATION_025_PARTIAL_OR_UNVERIFIED_STATE';
  END IF;
END
\$guard\$;
\ir ${MIGRATION_FILE}
COMMIT;
SQL

verify_schema
printf '%s\n' "MIGRATION_025_APPLIED_AND_VERIFIED:${environment}:${project}"
