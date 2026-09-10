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

schema_state() {
  psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE
  WHEN to_regclass(current_schema() || '.product_listings') IS NULL
    OR to_regclass(current_schema() || '.media_assets') IS NULL
    THEN 'missing_024'
  WHEN (
      SELECT count(*) FROM (VALUES
        (to_regclass(current_schema() || '.ad_listings')),
        (to_regclass(current_schema() || '.ad_free_slots')),
        (to_regclass(current_schema() || '.ad_request_receipts')),
        (to_regclass(current_schema() || '.ad_moderation_events'))
      ) AS tables(oid) WHERE oid IS NOT NULL
    ) = 0
    AND (
      SELECT count(*) FROM (VALUES
        (to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()')),
        (to_regprocedure(current_schema() || '.protect_ad_listing_identity()')),
        (to_regprocedure(current_schema() || '.reject_ad_audit_mutation()'))
      ) AS functions(oid) WHERE oid IS NOT NULL
    ) = 0
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets'
        AND c.conname IN ('media_assets_owner_type_check','media_assets_asset_type_check')
        AND (pg_get_constraintdef(c.oid) LIKE '%ad_listing%' OR pg_get_constraintdef(c.oid) LIKE '%ad_image%')
    )
    THEN 'not_applied'
  WHEN (
      SELECT count(*) FROM (VALUES
        (to_regclass(current_schema() || '.ad_listings')),
        (to_regclass(current_schema() || '.ad_free_slots')),
        (to_regclass(current_schema() || '.ad_request_receipts')),
        (to_regclass(current_schema() || '.ad_moderation_events'))
      ) AS tables(oid) WHERE oid IS NOT NULL
    ) < 4
    THEN 'partial_tables'
  WHEN (
      SELECT count(*) FROM pg_indexes
      WHERE schemaname=current_schema()
        AND indexname IN ('ad_listings_owner_created_idx','ad_listings_public_idx','ad_listings_pending_idx','ad_free_slots_owner_idx')
    ) < 4
    THEN 'missing_indexes'
  WHEN (
      SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND NOT t.tgisinternal
        AND t.tgname IN ('ad_free_slot_limit_before_insert','ad_listing_identity_before_update','ad_free_slots_append_only','ad_request_receipts_append_only','ad_moderation_events_append_only')
    ) < 5
    THEN 'missing_triggers'
  WHEN (
      SELECT count(*) FROM (VALUES
        (to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()')),
        (to_regprocedure(current_schema() || '.protect_ad_listing_identity()')),
        (to_regprocedure(current_schema() || '.reject_ad_audit_mutation()'))
      ) AS functions(oid) WHERE oid IS NOT NULL
    ) < 3
    THEN 'missing_functions'
  WHEN NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_owner_type_check'
        AND pg_get_constraintdef(c.oid) LIKE '%ad_listing%'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check'
        AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'
    )
    THEN 'missing_media'
  ELSE 'verified'
END;
SQL
}

exit_for_schema_state() {
  case "$1" in
    missing_024) exit 41 ;;
    not_applied) exit 42 ;;
    partial_tables) exit 43 ;;
    missing_indexes) exit 44 ;;
    missing_triggers) exit 45 ;;
    missing_functions) exit 46 ;;
    missing_media) exit 47 ;;
    *) exit 48 ;;
  esac
}

read_schema_state() {
  set +e
  state="$(schema_state 2>/dev/null)"
  state_status=$?
  set -e
  if [ "$state_status" -ne 0 ]; then
    exit 49
  fi
  printf '%s' "$state"
}

state="$(read_schema_state)"
if [ "$state" = 'verified' ]; then
  printf '%s\n' "MIGRATION_025_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi

if [ "$mode" = 'verify' ]; then
  exit_for_schema_state "$state"
fi

[ "$state" = 'not_applied' ] || exit_for_schema_state "$state"

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

state="$(read_schema_state)"
if [ "$state" != 'verified' ]; then
  exit_for_schema_state "$state"
fi
printf '%s\n' "MIGRATION_025_APPLIED_AND_VERIFIED:${environment}:${project}"
