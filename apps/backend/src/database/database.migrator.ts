import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabasePool } from './database.pool';

export const REQUIRED_CANONICAL_SCHEMA_VERSION = '034';

export type SchemaAnchorKind = 'table' | 'column' | 'constraint' | 'index' | 'function';

export interface SchemaAnchor {
  domain: string;
  migration: string;
  kind: SchemaAnchorKind;
  table: string;
  name: string;
}

const table = (domain: string, migration: string, name: string): SchemaAnchor =>
  ({ domain, migration, kind: 'table', table: name, name });
const column = (domain: string, migration: string, tableName: string, name: string): SchemaAnchor =>
  ({ domain, migration, kind: 'column', table: tableName, name });
const constraint = (domain: string, migration: string, tableName: string, name: string): SchemaAnchor =>
  ({ domain, migration, kind: 'constraint', table: tableName, name });
const index = (domain: string, migration: string, tableName: string, name: string): SchemaAnchor =>
  ({ domain, migration, kind: 'index', table: tableName, name });
const fn = (domain: string, migration: string, tableName: string, name: string): SchemaAnchor =>
  ({ domain, migration, kind: 'function', table: tableName, name });

/**
 * Deliberately bounded release contract. It verifies the structural anchors that
 * the runtime depends on; it is not a performance audit or a migration runner.
 */
export const CANONICAL_SCHEMA_ANCHORS: readonly SchemaAnchor[] = [
  table('identity', '001', 'core_user_accounts'),
  ...['user_identifier', 'identity_reference', 'account_status', 'lifecycle_status'].map((name) => column('identity', '001', 'core_user_accounts', name)),
  table('profiles', '002', 'profiles'),
  ...['profile_identifier', 'user_identifier', 'lifecycle_status', 'visibility'].map((name) => column('profiles', '002', 'profiles', name)),
  table('professional', '003', 'professional_profiles'),
  ...['professional_profile_identifier', 'user_identifier', 'visibility', 'moderation_status', 'lifecycle_status'].map((name) => column('professional', '003', 'professional_profiles', name)),
  constraint('professional', '003', 'professional_profiles', 'professional_profiles_lifecycle_status_check'),
  table('contact', '004', 'contact_inquiries'),
  ...['business_profile_id', 'professional_profile_id', 'status', 'tracking_status', 'created_at'].map((name) => column('contact', '015', 'contact_inquiries', name)),
  constraint('contact', '015', 'contact_inquiries', 'contact_inquiries_exactly_one_target_check'),
  constraint('contact', '015', 'contact_inquiries', 'contact_inquiries_tracking_status_check'),
  index('contact', '015', 'contact_inquiries', 'contact_inquiries_professional_created_idx'),
  table('contact', '004', 'contact_action_events'),
  table('sessions', '009', 'identity_sessions'),
  ...['session_identifier', 'user_identifier', 'token_hash', 'expires_at', 'revoked_at'].map((name) => column('sessions', '009', 'identity_sessions', name)),
  table('business', '010', 'business_profiles'),
  ...['visibility', 'moderation_status', 'trust_status', 'status'].map((name) => column('business', '010', 'business_profiles', name)),
  table('locations', '010', 'locations'),
  table('organizations', '010', 'organizations'),
  table('authorization', '010', 'roles'),
  table('authorization', '010', 'permissions'),
  table('media', '011', 'media_assets'),
  ...['owner_user_id', 'owner_type', 'owner_id', 'storage_key', 'public_url'].map((name) => column('media', '006', 'media_assets', name)),
  ...['asset_type', 'sort_order'].map((name) => column('media', '011', 'media_assets', name)),
  table('nearby', '012', 'nearby_preferences'),
  ...['user_identifier', 'coverage_radius', 'location_identifier'].map((name) => column('nearby', '012', 'nearby_preferences', name)),
  table('notifications', '013', 'nearby_notifications'),
  ...['notification_identifier', 'user_identifier', 'idempotency_key', 'read_at'].map((name) => column('notifications', '013', 'nearby_notifications', name)),
  index('notifications', '013', 'nearby_notifications', 'nearby_notifications_user_idempotency_idx'),
  table('supplier', '014', 'supplier_capabilities'),
  ...['supplier_capability_identifier', 'business_profile_id', 'supplier_type', 'coverage_location_identifier', 'status'].map((name) => column('supplier', '014', 'supplier_capabilities', name)),
  table('idempotency', '016', 'contact_submission_idempotency'),
  ...['submitter_user_id', 'idempotency_key', 'inquiry_id', 'payload_fingerprint', 'created_at'].map((name) => column('idempotency', '016', 'contact_submission_idempotency', name)),
  constraint('idempotency', '016', 'contact_submission_idempotency', 'contact_submission_idempotency_submitter_key_unique'),
  table('categories', '017', 'categories'),
  ...['code', 'name_ar', 'name_en', 'status', 'sort_order'].map((name) => column('categories', '017', 'categories', name)),
  ...['parent_code', 'visual_key', 'search_aliases_ar', 'search_aliases_en', 'is_featured'].map((name) => column('categories', '022', 'categories', name)),
  constraint('categories', '017', 'categories', 'categories_code_format_check'),
  constraint('categories', '022', 'categories', 'categories_parent_code_fk'),
  constraint('categories', '022', 'categories', 'categories_parent_not_self_check'),
  constraint('categories', '017', 'business_profiles', 'business_profiles_category_code_fk'),
  constraint('categories', '017', 'service_listings', 'service_listings_category_code_fk'),
  index('categories', '017', 'categories', 'categories_public_order_idx'),
  index('categories', '022', 'categories', 'categories_parent_public_order_idx'),
  table('rate-limit', '018', 'rate_limit_buckets'),
  ...['bucket_key', 'request_count', 'reset_at', 'updated_at'].map((name) => column('rate-limit', '018', 'rate_limit_buckets', name)),
  constraint('rate-limit', '018', 'rate_limit_buckets', 'rate_limit_buckets_key_format'),
  constraint('rate-limit', '018', 'rate_limit_buckets', 'rate_limit_buckets_request_count_nonnegative'),
  index('rate-limit', '018', 'rate_limit_buckets', 'rate_limit_buckets_reset_at_idx'),
  table('identity-recovery', '020', 'password_reset_tokens'),
  ...['reset_identifier', 'user_identifier', 'token_hash', 'expires_at', 'used_at'].map((name) => column('identity-recovery', '020', 'password_reset_tokens', name)),
  index('identity-recovery', '020', 'password_reset_tokens', 'password_reset_tokens_user_created_idx'),
  table('oauth', '020', 'external_identities'),
  ...['provider', 'provider_subject', 'user_identifier', 'email'].map((name) => column('oauth', '020', 'external_identities', name)),
  constraint('oauth', '020', 'external_identities', 'external_identities_provider_user_unique'),
  index('oauth', '020', 'external_identities', 'external_identities_user_idx'),
  table('reports', '021', 'provider_reports'),
  ...['report_identifier', 'reporter_user_identifier', 'target_type', 'reason_code', 'details', 'status', 'reviewed_by_user_identifier', 'resolution_note', 'created_at'].map((name) => column('reports', '021', 'provider_reports', name)),
  constraint('reports', '021', 'provider_reports', 'provider_reports_exactly_one_target_check'),
  index('reports', '021', 'provider_reports', 'provider_reports_open_reporter_target_idx'),
  table('store', '024', 'product_listings'),
  ...['business_profile_id', 'owner_user_id', 'title_ar', 'price', 'currency', 'category_code', 'availability', 'status', 'moderation_status'].map((name) => column('store', '024', 'product_listings', name)),
  index('store', '024', 'product_listings', 'product_listings_public_idx'),

  table('classifieds', '025', 'ad_listings'),
  table('classifieds', '025', 'ad_free_slots'),
  constraint('classifieds', '025', 'ad_listings', 'ad_listing_identity_owner_unique'),
  index('classifieds', '025', 'ad_listings', 'ad_listings_public_idx'),

  table('fulfillment', '026', 'fulfillment_orders'),
  table('fulfillment', '026', 'fulfillment_order_items'),
  table('fulfillment', '026', 'fulfillment_order_events'),
  table('fulfillment', '026', 'fulfillment_order_ratings'),
  table('fulfillment', '026', 'fulfillment_order_location_updates'),
  ...['customer_user_id', 'merchant_business_id', 'status', 'payment_method', 'payment_status'].map((name) => column('fulfillment', '026', 'fulfillment_orders', name)),
  constraint('fulfillment', '026', 'fulfillment_orders', 'fulfillment_orders_customer_idempotency_unique'),

  table('mobility-review', '027', 'mobility_document_reviews'),
  table('mobility-review', '027', 'mobility_document_review_events'),
  ...['business_profile_id', 'document_type', 'status'].map((name) => column('mobility-review', '027', 'mobility_document_reviews', name)),

  table('platform-notifications', '028', 'platform_notifications'),
  ...['user_id', 'event_key', 'event_type', 'reference_type', 'read_at'].map((name) => column('platform-notifications', '028', 'platform_notifications', name)),
  constraint('platform-notifications', '028', 'platform_notifications', 'platform_notifications_user_event_unique'),

  table('taxi-pricing', '029', 'taxi_pricing_revisions'),
  ...['zone_code', 'revision', 'currency_era', 'effective_base_minor', 'effective_per_km_minor'].map((name) => column('taxi-pricing', '029', 'taxi_pricing_revisions', name)),
  constraint('taxi-pricing', '029', 'taxi_pricing_revisions', 'taxi_pricing_revisions_zone_revision_unique'),

  table('billing', '030', 'billing_program_config'),
  table('billing', '030', 'billing_plans'),
  table('billing', '030', 'billing_purchase_orders'),
  table('billing', '030', 'billing_subscriptions'),
  table('billing', '030', 'billing_credit_grants'),
  table('billing', '030', 'billing_credit_ledger'),
  table('billing', '030', 'billing_usage_rates'),
  table('billing', '030', 'billing_usage_receipts'),
  table('billing', '030', 'billing_promo_redemptions'),

  table('taxi-ops', '031', 'khedmah_taxi.vehicle_approvals'),
  table('taxi-ops', '031', 'khedmah_taxi.driver_approvals'),
  table('taxi-ops', '031', 'khedmah_taxi.operational_approval_events'),
  fn('taxi-ops', '032', 'khedmah_taxi.resolve_actor_locked', 'profile_trust_gate'),

  constraint('billing', '033', 'admin_roles', 'admin_roles_role_check_billing_admin'),

  table('food-promotions', '034', 'food_promo_codes'),
  table('food-promotions', '034', 'food_promo_claims'),
  column('food-promotions', '034', 'fulfillment_orders', 'discount_amount'),
  column('food-promotions', '034', 'fulfillment_orders', 'food_promo_id'),
  constraint('food-promotions', '034', 'fulfillment_orders', 'fulfillment_orders_promo_snapshot_check')
];

interface CatalogRow extends Record<string, unknown> { kind: SchemaAnchorKind; table_name: string; name: string }

export class CanonicalSchemaError extends Error {
  constructor(anchor: SchemaAnchor) {
    super(`CANONICAL_SCHEMA_INCOMPATIBLE required=${REQUIRED_CANONICAL_SCHEMA_VERSION} missing=${anchor.domain}:${anchor.kind}:${anchor.table}.${anchor.name} introduced=${anchor.migration}`);
    this.name = 'CanonicalSchemaError';
  }
}

export function verifyCanonicalSchema(rows: readonly CatalogRow[]): void {
  const present = new Set(rows.map(({ kind, table_name, name }) => `${kind}:${table_name}:${name}`));
  const missing = CANONICAL_SCHEMA_ANCHORS.find(({ kind, table: tableName, name }) => !present.has(`${kind}:${tableName}:${name}`));
  if (missing) throw new CanonicalSchemaError(missing);
}

const CATALOG_QUERY = `
SELECT 'table' AS kind,
  CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS table_name,
  CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS name
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'khedmah_taxi') AND c.relkind IN ('r', 'p')
UNION ALL
SELECT 'column',
  CASE WHEN c.table_schema = 'public' THEN c.table_name ELSE c.table_schema || '.' || c.table_name END,
  c.column_name
FROM information_schema.columns c WHERE c.table_schema IN ('public', 'khedmah_taxi')
UNION ALL
SELECT 'constraint',
  CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END,
  con.conname
FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'khedmah_taxi')
UNION ALL
SELECT 'index',
  CASE WHEN n.nspname = 'public' THEN t.relname ELSE n.nspname || '.' || t.relname END,
  i.relname
FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class t ON t.oid = x.indrelid
JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname IN ('public', 'khedmah_taxi')
UNION ALL
SELECT 'function', 'khedmah_taxi.resolve_actor_locked', 'profile_trust_gate'
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'khedmah_taxi' AND p.proname = 'resolve_actor_locked'
  AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%b.trust_status <> ''approved''%'
  AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%b.moderation_status <> ''approved''%'
UNION ALL
SELECT 'constraint', 'admin_roles', 'admin_roles_role_check_billing_admin'
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'admin_roles' AND con.conname = 'admin_roles_role_check'
  AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%billing_admin%'`;

@Injectable()
export class DatabaseMigrator implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrator.name);

  constructor(@Inject(DatabasePool) private readonly pool: DatabasePool) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.pool.query<CatalogRow>(CATALOG_QUERY);
    verifyCanonicalSchema(rows);
    this.logger.log(`Canonical database schema ${REQUIRED_CANONICAL_SCHEMA_VERSION} verified.`);
  }
}
