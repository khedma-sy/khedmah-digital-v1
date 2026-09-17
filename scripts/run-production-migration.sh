#!/bin/sh
set -eu

case "${MIGRATION_VERSION:-}" in
  021_provider_reports)
    MIGRATION_FILE='/migrations/021_provider_reports.sql'
    MODE='legacy-verified'
    ;;
  022_expand_category_taxonomy)
    MIGRATION_FILE='/migrations/022_expand_category_taxonomy.sql'
    MODE='legacy-verified'
    ;;
  024_product_store)
    MIGRATION_FILE='/migrations/024_product_store.sql'
    MODE='legacy-verified'
    ;;
  025_classifieds)
    MIGRATION_FILE='/migrations/025_classifieds.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.product_listings'
    VERIFY_RELATIONS='public.ad_listings public.ad_free_slots public.ad_request_receipts public.ad_moderation_events'
    ;;
  026_cash_fulfillment_orders)
    MIGRATION_FILE='/migrations/026_cash_fulfillment_orders.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.ad_listings'
    VERIFY_RELATIONS='public.fulfillment_orders public.fulfillment_order_items public.fulfillment_order_events public.fulfillment_order_ratings public.fulfillment_order_location_updates'
    ;;
  027_mobility_document_reviews)
    MIGRATION_FILE='/migrations/027_mobility_document_reviews.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.fulfillment_orders'
    VERIFY_RELATIONS='public.mobility_document_reviews public.mobility_document_review_events'
    ;;
  028_platform_notifications)
    MIGRATION_FILE='/migrations/028_platform_notifications.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.mobility_document_reviews'
    VERIFY_RELATIONS='public.platform_notifications'
    ;;
  029_taxi_pricing_revisions)
    MIGRATION_FILE='/migrations/029_taxi_pricing_revisions.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.platform_notifications'
    VERIFY_RELATIONS='public.taxi_pricing_revisions'
    ;;
  030_billing_credits_subscriptions)
    MIGRATION_FILE='/migrations/030_billing_credits_subscriptions.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.taxi_pricing_revisions'
    VERIFY_RELATIONS='public.billing_program_config public.billing_plans public.billing_purchase_orders public.billing_subscriptions public.billing_credit_grants public.billing_credit_ledger public.billing_usage_rates public.billing_usage_receipts public.billing_promo_redemptions'
    ;;
  031_taxi_operational_approvals)
    MIGRATION_FILE='/migrations/031_taxi_operational_approvals.sql'
    MODE='wrapped'
    PREDECESSOR_RELATION='public.billing_plans'
    VERIFY_RELATIONS='khedmah_taxi.vehicle_approvals khedmah_taxi.driver_approvals khedmah_taxi.operational_approval_events'
    ;;
  032_taxi_operational_profile_gate)
    MIGRATION_FILE='/migrations/032_taxi_operational_profile_gate.sql'
    MODE='profile-gate'
    PREDECESSOR_RELATION='khedmah_taxi.driver_approvals'
    ;;
  033_billing_admin_role)
    MIGRATION_FILE='/migrations/033_billing_admin_role.sql'
    MODE='self-transaction'
    PREDECESSOR_RELATION='khedmah_taxi.driver_approvals'
    ;;
  034_food_order_promotions)
    MIGRATION_FILE='/migrations/034_food_order_promotions.sql'
    MODE='self-transaction'
    PREDECESSOR_RELATION='public.billing_plans'
    VERIFY_RELATIONS='public.food_promo_codes public.food_promo_claims'
    ;;
  *)
    echo "ERROR: Unsupported production migration: ${MIGRATION_VERSION:-unset}" >&2
    exit 1
    ;;
esac

test -n "${DATABASE_URL:-}"
test -n "${MIGRATION_SHA256:-}"
test -r "$MIGRATION_FILE"

ACTUAL_SHA256="$(sha256sum "$MIGRATION_FILE" | awk '{print $1}')"
if [ "$MIGRATION_SHA256" != "$ACTUAL_SHA256" ]; then
  echo "ERROR: Migration checksum mismatch for ${MIGRATION_VERSION}." >&2
  exit 1
fi
printf '%s  %s\n' "$MIGRATION_SHA256" "$MIGRATION_FILE" | sha256sum -c -

relation_exists() {
  relation="$1"
  result="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('$relation') IS NOT NULL")"
  [ "$result" = 't' ]
}

verify_relations() {
  for relation in ${VERIFY_RELATIONS:-}; do
    if ! relation_exists "$relation"; then
      echo "ERROR: Migration postcondition missing relation: $relation" >&2
      exit 1
    fi
  done
}

if [ -n "${PREDECESSOR_RELATION:-}" ] && ! relation_exists "$PREDECESSOR_RELATION"; then
  echo "ERROR: Required predecessor relation is missing: $PREDECESSOR_RELATION" >&2
  exit 1
fi

if [ "$MODE" = 'wrapped' ]; then
  primary_relation="${VERIFY_RELATIONS%% *}"
  if relation_exists "$primary_relation"; then
    echo "ERROR: Migration appears already or partially applied: $primary_relation" >&2
    exit 1
  fi
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT pg_advisory_lock(hashtextextended('khedmah-production-schema-migration', 0));
BEGIN;
\ir ${MIGRATION_FILE}
COMMIT;
SELECT pg_advisory_unlock(hashtextextended('khedmah-production-schema-migration', 0));
SQL
  verify_relations
  printf 'MIGRATION_%s_APPLIED_AND_VERIFIED\n' "${MIGRATION_VERSION%%_*}"
  exit 0
fi

if [ "$MODE" = 'profile-gate' ]; then
  current_gate="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='khedmah_taxi'
      AND p.proname='resolve_actor_locked'
      AND pg_get_function_identity_arguments(p.oid)='session_hash text, wants_driver boolean'
  ")"
  if printf '%s' "$current_gate" | grep -F "b.trust_status <> 'approved'" >/dev/null 2>&1; then
    echo 'ERROR: Migration 032 appears already applied.' >&2
    exit 1
  fi
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT pg_advisory_lock(hashtextextended('khedmah-production-schema-migration', 0));
BEGIN;
\ir ${MIGRATION_FILE}
COMMIT;
SELECT pg_advisory_unlock(hashtextextended('khedmah-production-schema-migration', 0));
SQL
  updated_gate="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='khedmah_taxi'
      AND p.proname='resolve_actor_locked'
      AND pg_get_function_identity_arguments(p.oid)='session_hash text, wants_driver boolean'
  ")"
  printf '%s' "$updated_gate" | grep -F "b.trust_status <> 'approved'" >/dev/null
  printf '%s' "$updated_gate" | grep -F "b.category_code = 'taxi'" >/dev/null
  printf '%s\n' 'MIGRATION_032_APPLIED_AND_VERIFIED'
  exit 0
fi

if [ "$MODE" = 'self-transaction' ]; then
  if [ "$MIGRATION_VERSION" = '033_billing_admin_role' ]; then
    current_constraint="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
      SELECT pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles' AND c.conname='admin_roles_role_check'
    ")"
    if printf '%s' "$current_constraint" | grep -F 'billing_admin' >/dev/null 2>&1; then
      echo 'ERROR: Migration 033 appears already applied.' >&2
      exit 1
    fi
  else
    if relation_exists 'public.food_promo_codes'; then
      echo 'ERROR: Migration 034 appears already applied.' >&2
      exit 1
    fi
    admin_constraint="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
      SELECT pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles' AND c.conname='admin_roles_role_check'
    ")"
    printf '%s' "$admin_constraint" | grep -F 'billing_admin' >/dev/null || {
      echo 'ERROR: Migration 034 requires Migration 033 billing_admin role.' >&2
      exit 1
    }
  fi

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT pg_advisory_lock(hashtextextended('khedmah-production-schema-migration', 0));
\ir ${MIGRATION_FILE}
SELECT pg_advisory_unlock(hashtextextended('khedmah-production-schema-migration', 0));
SQL

  if [ "$MIGRATION_VERSION" = '033_billing_admin_role' ]; then
    updated_constraint="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
      SELECT pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles' AND c.conname='admin_roles_role_check'
    ")"
    printf '%s' "$updated_constraint" | grep -F 'billing_admin' >/dev/null
    printf '%s\n' 'MIGRATION_033_APPLIED_AND_VERIFIED'
  else
    verify_relations
    promo_columns="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='fulfillment_orders'
        AND column_name IN ('food_promo_id','promo_code','discount_amount')
    ")"
    [ "$promo_columns" = '3' ]
    printf '%s\n' 'MIGRATION_034_APPLIED_AND_VERIFIED'
  fi
  exit 0
fi

# Legacy migrations retain their stronger migration-specific guards and postconditions.
if [ "$MIGRATION_VERSION" = '021_provider_reports' ]; then
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
    'report_identifier','reporter_user_identifier','target_type','business_profile_id',
    'professional_profile_identifier','reason_code','details','status',
    'reviewed_by_user_identifier','resolution_note','created_at','updated_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='provider_reports' AND column_name=required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_021_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
END
\$migration_verify\$;
COMMIT;
SQL
  printf '%s\n' 'MIGRATION_021_APPLIED_AND_VERIFIED'
  exit 0
fi

if [ "$MIGRATION_VERSION" = '024_product_store' ]; then
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
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_024_TABLE_POSTCONDITION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname=current_schema() AND tablename='product_listings' AND indexname='product_listings_public_idx'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_024_INDEX_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL
  printf '%s\n' 'MIGRATION_024_APPLIED_AND_VERIFIED'
  exit 0
fi

# Migration 022 remains last legacy case.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-migration', 0));
DO \$migration_guard\$
BEGIN
  IF to_regclass(current_schema() || '.provider_reports') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_REQUIRES_SCHEMA_021';
  END IF;
  IF to_regclass(current_schema() || '.organizations') IS NULL
     OR to_regclass(current_schema() || '.organization_members') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_MISSING';
  END IF;
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL
     OR to_regclass(current_schema() || '.product_listings') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
END
\$migration_guard\$;
\ir ${MIGRATION_FILE}
DO \$migration_verify\$
DECLARE
  required_column text;
BEGIN
  FOREACH required_column IN ARRAY ARRAY[
    'parent_code','visual_key','search_aliases_ar','search_aliases_en','is_featured'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='categories' AND column_name=required_column
    ) THEN
      RAISE EXCEPTION 'MIGRATION_022_COLUMN_POSTCONDITION_FAILED: %', required_column;
    END IF;
  END LOOP;
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_BEFORE_IMAGE_POSTCONDITION_FAILED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM categories
    WHERE status='active'
      AND parent_code IS NULL
      AND code NOT IN (
        'home_maintenance','food_hospitality','health_medical','education_training',
        'professional_services','beauty_personal_care','retail_shopping','automotive',
        'transport_logistics','technology_digital','construction_real_estate',
        'events_occasions','agriculture_livestock','industrial_supply','travel_tourism'
      )
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_NONCANONICAL_ACTIVE_POSTCONDITION_FAILED';
  END IF;
END
\$migration_verify\$;
COMMIT;
SQL

printf '%s\n' 'MIGRATION_022_APPLIED_AND_VERIFIED'
