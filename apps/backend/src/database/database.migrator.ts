import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabasePool } from './database.pool';

export const REQUIRED_CANONICAL_SCHEMA_VERSION = '035';

export type SchemaAnchorKind = 'table' | 'column' | 'constraint' | 'index';

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

/**
 * Deliberately small contract surface: identity/ownership, public eligibility,
 * lifecycle integrity, idempotency and production identity recovery/OAuth anchors.
 * It is not intended to be an exhaustive database performance audit.
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
  table('supplier', '014', 'supplier_capabilities'),
  ...['supplier_capability_identifier', 'business_profile_id', 'supplier_type', 'coverage_location_identifier', 'status'].map((name) => column('supplier', '014', 'supplier_capabilities', name)),
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
  table('classifieds', '024', 'product_listings'),
  ...['business_profile_id', 'owner_user_id', 'title_ar', 'price', 'currency', 'category_code', 'availability', 'status', 'moderation_status'].map((name) => column('classifieds', '024', 'product_listings', name)),
  index('classifieds', '024', 'product_listings', 'product_listings_public_idx'),
  table('mobility', '025', 'mobility_requests'),
  ...['rider_user_id', 'provider_business_id', 'service_type', 'pickup_address', 'destination_address', 'rider_contact_phone', 'status', 'idempotency_key'].map((name) => column('mobility', '025', 'mobility_requests', name)),
  constraint('mobility', '025', 'mobility_requests', 'mobility_requests_rider_idempotency_unique'),
  index('mobility', '025', 'mobility_requests', 'mobility_requests_one_open_per_rider_idx'),
  table('mobility', '025', 'mobility_request_events'),
  index('mobility', '025', 'mobility_request_events', 'mobility_request_events_request_time_idx'),
  table('fulfillment', '026', 'fulfillment_orders'),
  ...['customer_user_id', 'merchant_business_id', 'courier_business_id', 'status', 'payment_method', 'subtotal', 'delivery_address', 'idempotency_key'].map((name) => column('fulfillment', '026', 'fulfillment_orders', name)),
  constraint('fulfillment', '026', 'fulfillment_orders', 'fulfillment_orders_customer_idempotency_unique'),
  table('fulfillment', '026', 'fulfillment_order_items'),
  table('fulfillment', '026', 'fulfillment_order_events'),
  table('fulfillment', '026', 'fulfillment_order_ratings'),
  table('fulfillment', '026', 'fulfillment_order_location_updates'),
  constraint('fulfillment', '026', 'fulfillment_order_location_updates', 'fulfillment_order_location_order_unique')
  ,table('professional-services', '027', 'professional_service_requests'),
  ...['customer_user_id','category_code','status','accepted_offer_id','payment_method','payment_status','expires_at'].map((name) => column('professional-services','027','professional_service_requests',name)),
  table('professional-services', '027', 'professional_service_offers'),
  constraint('professional-services','027','professional_service_offers','professional_service_offers_provider_unique'),
  table('professional-services', '027', 'professional_service_events'),
  table('professional-services', '027', 'professional_service_warranties'),
  table('professional-services', '027', 'professional_service_ratings'),
  index('professional-services','027','professional_service_requests','professional_requests_category_open_idx'),
  table('promotions','028','promotion_business_codes'),
  constraint('promotions','028','promotion_business_codes','promotion_business_codes_static_code_check'),
  table('promotions','028','promotions'),
  ...['business_profile_id','owner_user_id','discount_type','original_price','discount_value','starts_at','ends_at','total_limit','per_user_limit','redeemed_count','moderation_status'].map((name)=>column('promotions','028','promotions',name)),
  table('promotions','028','promotion_claims'),
  constraint('promotions','028','promotion_claims','promotion_claims_redemption_code_check'),
  table('promotions','028','promotion_events'),
  index('promotions','028','promotions','promotions_public_active_idx'),
  table('admin-users','029','admin_user_actions'),
  ...['target_user_id','actor_user_id','action','reason','previous_status','new_status','created_at'].map((name)=>column('admin-users','029','admin_user_actions',name)),
  constraint('admin-users','029','admin_user_actions','admin_user_actions_status_change_check'),
  index('admin-users','029','admin_user_actions','admin_user_actions_target_created_idx'),
  table('operations-issues','030','operations_incidents'),
  constraint('operations-issues','030','operations_incidents','operations_incidents_resolution_check'),
  index('operations-issues','030','operations_incidents','operations_incidents_queue_idx'),
  table('operations-issues','030','operations_incident_events'),
  index('operations-issues','030','operations_incident_events','operations_incident_events_incident_time_idx'),
  table('admin-catalog','031','admin_catalog_actions'),
  constraint('admin-catalog','031','admin_catalog_actions','admin_catalog_actions_status_change_check'),
  index('admin-catalog','031','admin_catalog_actions','admin_catalog_actions_category_created_idx'),
  table('mobility-fares','032','mobility_fare_policies'),
  ...['arrived_at','started_at','route_distance_meters','waiting_seconds','fare_status','final_fare'].map((name)=>column('mobility-fares','032','mobility_requests',name)),
  constraint('mobility-fares','032','mobility_requests','mobility_requests_fare_complete_check'),
  table('mobility-documents','033','mobility_document_reviews'),
  ...['media_asset_id','business_profile_id','document_type','status','reviewed_by','reviewed_at'].map((name)=>column('mobility-documents','033','mobility_document_reviews',name)),
  constraint('mobility-documents','033','mobility_document_reviews','mobility_document_reviews_decision_check'),
  index('mobility-documents','033','mobility_document_reviews','mobility_document_reviews_business_status_idx'),
  table('mobility-documents','033','mobility_document_review_events'),
  ...['delivery_contract_version','package_description','package_size','recipient_name','recipient_phone','pickup_verification_hash','delivery_verification_hash','pickup_verified_at','delivery_verified_at']
    .map((name)=>column('mobility-delivery-proof','034','mobility_requests',name)),
  constraint('mobility-delivery-proof','034','mobility_requests','mobility_requests_delivery_shape_check'),
  index('mobility-delivery-proof','034','mobility_requests','mobility_requests_delivery_recipient_idx'),
  table('platform-notifications','035','platform_notifications'),
  ...['user_id','event_key','event_type','reference_type','reference_id','read_at','created_at'].map((name)=>column('platform-notifications','035','platform_notifications',name)),
  constraint('platform-notifications','035','platform_notifications','platform_notifications_user_event_unique'),
  index('platform-notifications','035','platform_notifications','platform_notifications_user_unread_idx')
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
SELECT 'table' AS kind, c.relname AS table_name, c.relname AS name
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p')
UNION ALL
SELECT 'column', c.table_name, c.column_name
FROM information_schema.columns c WHERE c.table_schema = current_schema()
UNION ALL
SELECT 'constraint', c.relname, con.conname
FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()
UNION ALL
SELECT 'index', t.relname, i.relname
FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class t ON t.oid = x.indrelid
JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = current_schema()`;

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
