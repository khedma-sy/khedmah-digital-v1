#!/bin/sh
set -eu

test "${DEPLOYMENT_ENVIRONMENT:-}" = 'preview' || {
  echo 'ERROR: Preview migration runner requires DEPLOYMENT_ENVIRONMENT=preview.' >&2
  exit 2
}
test -n "${DATABASE_URL:-}"
test -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" || {
  echo 'ERROR: Preview migration runner requires CLOUD_SQL_INSTANCE_CONNECTION_NAME.' >&2
  exit 2
}
readonly EXPECTED_DATABASE="${EXPECTED_PREVIEW_DATABASE:-khedmah_preview}"
readonly PREVIEW_SOCKET_URI="%2Fcloudsql%2F${CLOUD_SQL_INSTANCE_CONNECTION_NAME}"
case "$DATABASE_URL" in
  *\?*) readonly PREVIEW_DATABASE_URL="${DATABASE_URL}&host=${PREVIEW_SOCKET_URI}" ;;
  *) readonly PREVIEW_DATABASE_URL="${DATABASE_URL}?host=${PREVIEW_SOCKET_URI}" ;;
esac

actual_database="$(psql "$PREVIEW_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
test "$actual_database" = "$EXPECTED_DATABASE" || {
  echo "ERROR: Refusing preview migrations for unexpected database: ${actual_database}." >&2
  exit 3
}

psql "$PREVIEW_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-preview-schema-migration', 0));
SELECT (to_regclass(current_schema() || '.product_listings') IS NOT NULL) AS schema_ready \gset

\if :schema_ready
  DO $verify$
  BEGIN
    IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL
      OR to_regclass(current_schema() || '.provider_reports') IS NULL
      OR to_regclass(current_schema() || '.core_user_accounts') IS NULL
    THEN
      RAISE EXCEPTION 'PREVIEW_SCHEMA_024_INCOMPLETE';
    END IF;
  END
  $verify$;
\else
  DO $guard$
  BEGIN
    IF to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL
      OR to_regclass(current_schema() || '.categories') IS NOT NULL
      OR to_regclass(current_schema() || '.provider_reports') IS NOT NULL
    THEN
      RAISE EXCEPTION 'PREVIEW_SCHEMA_PARTIAL_REQUIRES_MANUAL_REPAIR';
    END IF;
  END
  $guard$;
  \ir /migrations/001_core_identity_accounts.sql
  \ir /migrations/002_create_profiles.sql
  \ir /migrations/003_create_professional_profiles.sql
  \ir /migrations/004_analytics_and_contact.sql
  \ir /migrations/005_email_verifications_and_admin_roles.sql
  \ir /migrations/006_media_assets.sql
  \ir /migrations/007_v2_marketplace.sql
  \ir /migrations/008_provider_service_radius.sql
  \ir /migrations/009_canonical_identity_runtime.sql
  \ir /migrations/010_canonical_runtime_domains.sql
  \ir /migrations/011_canonical_media_contract.sql
  \ir /migrations/012_nearby_preferences.sql
  \ir /migrations/013_nearby_notifications_read_state.sql
  \ir /migrations/014_supplier_discovery.sql
  \ir /migrations/015_contact_target_contract.sql
  \ir /migrations/016_contact_submission_idempotency.sql
  \ir /migrations/017_category_taxonomy_contract.sql
  \ir /migrations/018_persistent_rate_limit_buckets.sql
  \ir /migrations/019_remove_out_of_scope_subscription_schema.sql
  \ir /migrations/020_identity_recovery_oauth.sql
  \ir /migrations/021_provider_reports.sql
  \ir /migrations/022_expand_category_taxonomy.sql
  \ir /migrations/024_product_store.sql
\endif

SELECT (to_regclass(current_schema() || '.mobility_requests') IS NOT NULL) AS mobility_ready \gset
\if :mobility_ready
\else
  \ir /migrations/025_mobility_requests.sql
\endif

SELECT (to_regclass(current_schema() || '.fulfillment_orders') IS NOT NULL) AS fulfillment_ready \gset
\if :fulfillment_ready
\else
  \ir /migrations/026_cash_fulfillment_orders.sql
\endif

SELECT (to_regclass(current_schema() || '.professional_service_requests') IS NOT NULL) AS professional_services_ready \gset
\if :professional_services_ready
\else
  \ir /migrations/027_professional_service_marketplace.sql
\endif

SELECT (to_regclass(current_schema() || '.promotions') IS NOT NULL) AS promotions_ready \gset
\if :promotions_ready
\else
  \ir /migrations/028_khedmah_promotions.sql
\endif

SELECT (to_regclass(current_schema() || '.admin_user_actions') IS NOT NULL) AS admin_users_ready \gset
\if :admin_users_ready
\else
  \ir /migrations/029_admin_user_management.sql
\endif

SELECT (to_regclass(current_schema() || '.operations_incidents') IS NOT NULL) AS operations_issues_ready \gset
\if :operations_issues_ready
\else
  \ir /migrations/030_operations_issue_center.sql
\endif

SELECT (to_regclass(current_schema() || '.admin_catalog_actions') IS NOT NULL) AS admin_catalog_ready \gset
\if :admin_catalog_ready
\else
  \ir /migrations/031_admin_catalog_management.sql
\endif

DO $postcondition$
BEGIN
  IF to_regclass(current_schema() || '.product_listings') IS NULL
    OR to_regclass(current_schema() || '.mobility_requests') IS NULL
    OR to_regclass(current_schema() || '.fulfillment_orders') IS NULL
    OR to_regclass(current_schema() || '.fulfillment_order_ratings') IS NULL
    OR to_regclass(current_schema() || '.fulfillment_order_location_updates') IS NULL
    OR to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL
    OR to_regclass(current_schema() || '.professional_service_requests') IS NULL
    OR to_regclass(current_schema() || '.professional_service_offers') IS NULL
    OR to_regclass(current_schema() || '.professional_service_warranties') IS NULL
    OR to_regclass(current_schema() || '.promotion_business_codes') IS NULL
    OR to_regclass(current_schema() || '.promotions') IS NULL
    OR to_regclass(current_schema() || '.promotion_claims') IS NULL
    OR to_regclass(current_schema() || '.admin_user_actions') IS NULL
    OR to_regclass(current_schema() || '.operations_incidents') IS NULL
    OR to_regclass(current_schema() || '.operations_incident_events') IS NULL
    OR to_regclass(current_schema() || '.admin_catalog_actions') IS NULL
  THEN
    RAISE EXCEPTION 'PREVIEW_SCHEMA_031_POSTCONDITION_FAILED';
  END IF;
END
$postcondition$;
COMMIT;
SQL

printf '%s\n' 'PREVIEW_SCHEMA_031_READY'
