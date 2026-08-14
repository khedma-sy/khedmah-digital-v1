import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabasePool } from './database.pool';

export const REQUIRED_CANONICAL_SCHEMA_VERSION = '016';

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
 * lifecycle integrity, idempotency and the final 015 contact discriminator.
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
  table('supplier', '014', 'supplier_capabilities'),
  ...['supplier_capability_identifier', 'business_profile_id', 'supplier_type', 'coverage_location_identifier', 'status'].map((name) => column('supplier', '014', 'supplier_capabilities', name))
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
