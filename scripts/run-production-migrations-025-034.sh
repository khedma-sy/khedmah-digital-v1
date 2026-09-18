#!/bin/sh
set -eu

case "${MIGRATION_NUMBER:-}" in
  025)
    MIGRATION_NAME='025_classifieds'
    PREDECESSOR_SQL="SELECT to_regclass('public.product_listings') IS NOT NULL"
    GUARD="to_regclass('public.ad_listings')"
    ;;
  026)
    MIGRATION_NAME='026_cash_fulfillment_orders'
    PREDECESSOR_SQL="SELECT to_regclass('public.ad_listings') IS NOT NULL"
    GUARD="to_regclass('public.fulfillment_orders')"
    ;;
  027)
    MIGRATION_NAME='027_mobility_document_reviews'
    PREDECESSOR_SQL="SELECT to_regclass('public.fulfillment_orders') IS NOT NULL"
    GUARD="to_regclass('public.mobility_document_reviews')"
    ;;
  028)
    MIGRATION_NAME='028_platform_notifications'
    PREDECESSOR_SQL="SELECT to_regclass('public.mobility_document_reviews') IS NOT NULL"
    GUARD="to_regclass('public.platform_notifications')"
    ;;
  029)
    MIGRATION_NAME='029_taxi_pricing_revisions'
    PREDECESSOR_SQL="SELECT to_regclass('public.platform_notifications') IS NOT NULL"
    GUARD="to_regclass('public.taxi_pricing_revisions')"
    ;;
  030)
    MIGRATION_NAME='030_billing_credits_subscriptions'
    PREDECESSOR_SQL="SELECT to_regclass('public.taxi_pricing_revisions') IS NOT NULL"
    GUARD="to_regclass('public.billing_program_config')"
    ;;
  031)
    MIGRATION_NAME='031_taxi_operational_approvals'
    PREDECESSOR_SQL="SELECT to_regclass('public.billing_program_config') IS NOT NULL"
    GUARD="to_regclass('khedmah_taxi.driver_approvals')"
    ;;
  032)
    MIGRATION_NAME='032_taxi_operational_profile_gate'
    PREDECESSOR_SQL="SELECT to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL AND to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL"
    GUARD="CASE
      WHEN to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NULL THEN NULL
      WHEN position('FROM public.business_profiles bb' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
       AND position(\$needle\$b.trust_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
       AND position(\$needle\$b.moderation_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
      THEN 1 ELSE NULL END"
    ;;
  033)
    MIGRATION_NAME='033_billing_admin_role'
    PREDECESSOR_SQL="SELECT to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NOT NULL
      AND position(\$needle\$b.trust_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0"
    GUARD="CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles'
        AND c.conname='admin_roles_role_check'
        AND pg_get_constraintdef(c.oid) LIKE '%billing_admin%'
    ) THEN 1 ELSE NULL END"
    ;;
  034)
    MIGRATION_NAME='034_food_order_promotions'
    PREDECESSOR_SQL="SELECT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='admin_roles'
        AND c.conname='admin_roles_role_check'
        AND pg_get_constraintdef(c.oid) LIKE '%billing_admin%'
    )"
    GUARD="to_regclass('public.food_promo_codes')"
    ;;
  *)
    echo 'ERROR: MIGRATION_NUMBER must be one of 025..034.' >&2
    exit 1
    ;;
esac

MIGRATION_FILE="/migrations/${MIGRATION_NAME}.sql"

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 1; }
printf '%s' "${MIGRATION_SHA256:-}" | grep -Eq '^[0-9a-f]{64}$' || {
  echo 'ERROR: MIGRATION_SHA256 must be a lowercase SHA-256.' >&2
  exit 1
}
test -r "$MIGRATION_FILE" || { echo "ERROR: Missing migration file $MIGRATION_FILE" >&2; exit 1; }
printf '%s  %s\n' "$MIGRATION_SHA256" "$MIGRATION_FILE" | sha256sum -c -

predecessor_ok="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$PREDECESSOR_SQL")"
test "$predecessor_ok" = 't' || {
  echo "ERROR: MIGRATION_${MIGRATION_NUMBER}_PREDECESSOR_MISSING" >&2
  exit 1
}

already="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT CASE WHEN ($GUARD) IS NULL THEN '' ELSE 'applied' END")"
if [ "$already" = 'applied' ]; then
  echo "ERROR: MIGRATION_${MIGRATION_NUMBER}_ALREADY_APPLIED_OR_PARTIAL" >&2
  exit 1
fi

if [ "$MIGRATION_NUMBER" = '033' ] || [ "$MIGRATION_NUMBER" = '034' ]; then
  # These reviewed files contain their own BEGIN/COMMIT blocks. Hold a session
  # advisory lock around the include rather than nesting another transaction.
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT pg_advisory_lock(hashtextextended('khedmah-production-schema-migration', 0));
\ir ${MIGRATION_FILE}
SELECT pg_advisory_unlock(hashtextextended('khedmah-production-schema-migration', 0));
SQL
else
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-migration', 0));
\ir ${MIGRATION_FILE}
COMMIT;
SQL
fi

case "$MIGRATION_NUMBER" in
  025) VERIFY_SQL="SELECT to_regclass('public.ad_listings') IS NOT NULL AND to_regclass('public.ad_free_slots') IS NOT NULL" ;;
  026) VERIFY_SQL="SELECT to_regclass('public.fulfillment_orders') IS NOT NULL AND to_regclass('public.fulfillment_order_items') IS NOT NULL" ;;
  027) VERIFY_SQL="SELECT to_regclass('public.mobility_document_reviews') IS NOT NULL AND to_regclass('public.mobility_document_review_events') IS NOT NULL" ;;
  028) VERIFY_SQL="SELECT to_regclass('public.platform_notifications') IS NOT NULL" ;;
  029) VERIFY_SQL="SELECT to_regclass('public.taxi_pricing_revisions') IS NOT NULL" ;;
  030) VERIFY_SQL="SELECT to_regclass('public.billing_program_config') IS NOT NULL AND to_regclass('public.billing_subscriptions') IS NOT NULL AND to_regclass('public.billing_credit_ledger') IS NOT NULL" ;;
  031) VERIFY_SQL="SELECT to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL AND to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL" ;;
  032) VERIFY_SQL="SELECT position('FROM public.business_profiles bb' in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
    AND position(\$needle\$b.trust_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0
    AND position(\$needle\$b.moderation_status <> 'approved'\$needle\$ in pg_get_functiondef(to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)'))) > 0" ;;
  033) VERIFY_SQL="SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='admin_roles'
      AND c.conname='admin_roles_role_check'
      AND pg_get_constraintdef(c.oid) LIKE '%billing_admin%'
  )" ;;
  034) VERIFY_SQL="SELECT to_regclass('public.food_promo_codes') IS NOT NULL
    AND to_regclass('public.food_promo_claims') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fulfillment_orders' AND column_name='discount_amount'
    )" ;;
esac

verified="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$VERIFY_SQL")"
test "$verified" = 't' || {
  echo "ERROR: MIGRATION_${MIGRATION_NUMBER}_POSTCONDITION_FAILED" >&2
  exit 1
}

echo "MIGRATION_${MIGRATION_NUMBER}_APPLIED_AND_VERIFIED"
