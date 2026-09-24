#!/bin/sh
set -eu

MIGRATIONS="
001_core_identity_accounts
002_create_profiles
003_create_professional_profiles
004_analytics_and_contact
005_email_verifications_and_admin_roles
006_media_assets
007_v2_marketplace
008_provider_service_radius
009_canonical_identity_runtime
010_canonical_runtime_domains
011_canonical_media_contract
012_nearby_preferences
013_nearby_notifications_read_state
014_supplier_discovery
015_contact_target_contract
016_contact_submission_idempotency
017_category_taxonomy_contract
018_persistent_rate_limit_buckets
019_remove_out_of_scope_subscription_schema
020_identity_recovery_oauth
"

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 1; }
printf '%s' "${BASELINE_MANIFEST_SHA256:-}" | grep -Eq '^[0-9a-f]{64}$' || {
  echo 'ERROR: BASELINE_MANIFEST_SHA256 must be a lowercase SHA-256.' >&2
  exit 1
}

files=''
for migration in $MIGRATIONS; do
  file="/migrations/${migration}.sql"
  test -r "$file" || { echo "ERROR: Missing baseline migration $file" >&2; exit 1; }
  files="$files $file"
done

actual_manifest_sha="$(cat $files | sha256sum | awk '{print $1}')"
test "$actual_manifest_sha" = "$BASELINE_MANIFEST_SHA256" || {
  echo 'ERROR: baseline migration manifest checksum mismatch.' >&2
  exit 1
}

fresh="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','khedmah_taxi')
    AND c.relkind IN ('r','p')
    AND c.relname IN (
      'core_user_accounts','profiles','professional_profiles','contact_inquiries',
      'identity_sessions','business_profiles','locations','organizations','roles',
      'permissions','media_assets','nearby_preferences','nearby_notifications',
      'supplier_capabilities','contact_submission_idempotency','categories',
      'rate_limit_buckets','password_reset_tokens','external_identities',
      'product_listings','ad_listings','fulfillment_orders','billing_program_config',
      'taxi_pricing_revisions','food_promo_codes','driver_approvals'
    )
) THEN 'dirty' ELSE 'fresh' END")"
test "$fresh" = fresh || {
  echo 'ERROR: BASELINE_REQUIRES_FRESH_DATABASE' >&2
  exit 1
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-baseline-001-020', 0));
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

DO $baseline_verify$
BEGIN
  IF to_regclass('public.core_user_accounts') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.professional_profiles') IS NULL
    OR to_regclass('public.business_profiles') IS NULL
    OR to_regclass('public.locations') IS NULL
    OR to_regclass('public.organizations') IS NULL
    OR to_regclass('public.roles') IS NULL
    OR to_regclass('public.permissions') IS NULL
    OR to_regclass('public.media_assets') IS NULL
    OR to_regclass('public.identity_sessions') IS NULL
    OR to_regclass('public.nearby_preferences') IS NULL
    OR to_regclass('public.nearby_notifications') IS NULL
    OR to_regclass('public.supplier_capabilities') IS NULL
    OR to_regclass('public.contact_submission_idempotency') IS NULL
    OR to_regclass('public.categories') IS NULL
    OR to_regclass('public.rate_limit_buckets') IS NULL
    OR to_regclass('public.password_reset_tokens') IS NULL
    OR to_regclass('public.external_identities') IS NULL
  THEN
    RAISE EXCEPTION 'BASELINE_001_020_POSTCONDITION_FAILED';
  END IF;

  IF to_regclass('public.plans') IS NOT NULL OR to_regclass('public.subscriptions') IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE_019_SCOPE_RECONCILIATION_FAILED';
  END IF;
END
$baseline_verify$;
COMMIT;
SQL

echo "BASELINE_001_020_APPLIED_AND_VERIFIED"
