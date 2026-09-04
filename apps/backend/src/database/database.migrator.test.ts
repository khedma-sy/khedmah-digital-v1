import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANONICAL_SCHEMA_ANCHORS,
  CanonicalSchemaError,
  DatabaseMigrator,
  REQUIRED_CANONICAL_SCHEMA_VERSION,
  verifyCanonicalSchema
} from './database.migrator';

const completeCatalog = () => CANONICAL_SCHEMA_ANCHORS.map(({ kind, table, name }) => ({ kind, table_name: table, name }));
const without = (predicate: (anchor: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => boolean) =>
  CANONICAL_SCHEMA_ANCHORS.filter((anchor) => !predicate(anchor)).map(({ kind, table, name }) => ({ kind, table_name: table, name }));

test('canonical schema 035 passes when every contract anchor is present', () => {
  assert.equal(REQUIRED_CANONICAL_SCHEMA_VERSION, '035');
  assert.doesNotThrow(() => verifyCanonicalSchema(completeCatalog()));
});

for (const scenario of [
  ['missing table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.kind === 'table' && a.name === 'core_user_accounts'],
  ['missing critical column', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.kind === 'column' && a.table === 'identity_sessions' && a.name === 'token_hash'],
  ['missing contact XOR constraint', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'contact_inquiries_exactly_one_target_check'],
  ['missing contact tracking CHECK', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'contact_inquiries_tracking_status_check'],
  ['missing notification read state', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'nearby_notifications' && a.name === 'read_at'],
  ['missing supplier anchor', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'supplier_capabilities' && a.name === 'coverage_location_identifier'],
  ['missing 016 idempotency uniqueness', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'contact_submission_idempotency_submitter_key_unique'],
  ['missing 017 Category authority', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'categories_code_format_check'],
  ['missing 018 persistent rate-limit table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'rate_limit_buckets' && a.kind === 'table'],
  ['missing 020 password recovery table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'password_reset_tokens' && a.kind === 'table'],
  ['missing 020 external identity binding', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'external_identities' && a.kind === 'table'],
  ['missing 021 provider reports table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'provider_reports' && a.kind === 'table'],
  ['missing 022 category hierarchy', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'categories_parent_code_fk'],
  ['missing 024 classifieds table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'product_listings' && a.kind === 'table'],
  ['missing 025 mobility table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'mobility_requests' && a.kind === 'table'],
  ['missing 026 fulfillment table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'fulfillment_orders' && a.kind === 'table'],
  ['014-equivalent schema missing 015 index', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'contact_inquiries_professional_created_idx']
] as const) {
  test(`${scenario[0]} fails closed without exposing credentials`, () => {
    assert.throws(() => verifyCanonicalSchema(without(scenario[1])), (error: unknown) => {
      assert.ok(error instanceof CanonicalSchemaError);
      assert.match(error.message, /CANONICAL_SCHEMA_INCOMPATIBLE required=035 missing=/);
      assert.doesNotMatch(error.message, /DATABASE_URL|postgres(?:ql)?:\/\//i);
      return true;
    });
  });
}

test('legacy professional table alone cannot satisfy the canonical contract', () => {
  const rows = without((a) => a.table === 'professional_profiles');
  rows.push({ kind: 'table', table_name: 'professional_directory_profiles', name: 'professional_directory_profiles' });
  assert.throws(() => verifyCanonicalSchema(rows), /professional:table:professional_profiles/);
});

test('module initialization verifies before startup can complete and performs no DDL', async () => {
  const calls: string[] = [];
  const pool = { query: async (sql: string) => { calls.push(sql); return completeCatalog(); } };
  await new DatabaseMigrator(pool as never).onModuleInit();
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0], /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i);
});

test('module initialization rejects before Nest application initialization completes', async () => {
  const pool = { query: async () => without((a) => a.name === 'read_at') };
  await assert.rejects(new DatabaseMigrator(pool as never).onModuleInit(), /CANONICAL_SCHEMA_INCOMPATIBLE/);
});
