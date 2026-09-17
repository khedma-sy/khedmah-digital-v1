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

test('canonical schema 034 passes when every release contract anchor is present', () => {
  assert.equal(REQUIRED_CANONICAL_SCHEMA_VERSION, '034');
  assert.doesNotThrow(() => verifyCanonicalSchema(completeCatalog()));
});

for (const scenario of [
  ['missing identity table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.kind === 'table' && a.name === 'core_user_accounts'],
  ['missing critical session column', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.kind === 'column' && a.table === 'identity_sessions' && a.name === 'token_hash'],
  ['missing contact XOR constraint', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'contact_inquiries_exactly_one_target_check'],
  ['missing 024 store table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'product_listings' && a.kind === 'table'],
  ['missing 025 classifieds table', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'ad_listings' && a.kind === 'table'],
  ['missing 026 fulfillment orders', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'fulfillment_orders' && a.kind === 'table'],
  ['missing 027 mobility review', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'mobility_document_reviews' && a.kind === 'table'],
  ['missing 028 platform notifications', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'platform_notifications' && a.kind === 'table'],
  ['missing 029 taxi pricing', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'taxi_pricing_revisions' && a.kind === 'table'],
  ['missing 030 billing ledger', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'billing_credit_ledger' && a.kind === 'table'],
  ['missing 031 taxi driver approvals', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'khedmah_taxi.driver_approvals' && a.kind === 'table'],
  ['missing 032 taxi profile trust gate', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.kind === 'function' && a.name === 'profile_trust_gate'],
  ['missing 033 billing admin authority', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.name === 'admin_roles_role_check_billing_admin'],
  ['missing 034 food promotion claims', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'food_promo_claims' && a.kind === 'table'],
  ['missing 034 fulfillment discount snapshot', (a: (typeof CANONICAL_SCHEMA_ANCHORS)[number]) => a.table === 'fulfillment_orders' && a.name === 'discount_amount']
] as const) {
  test(`${scenario[0]} fails closed without exposing credentials`, () => {
    assert.throws(() => verifyCanonicalSchema(without(scenario[1])), (error: unknown) => {
      assert.ok(error instanceof CanonicalSchemaError);
      assert.match(error.message, /CANONICAL_SCHEMA_INCOMPATIBLE required=034 missing=/);
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

test('catalog verification includes public and khedmah_taxi schemas and performs no DDL', async () => {
  const calls: string[] = [];
  const pool = { query: async (sql: string) => { calls.push(sql); return completeCatalog(); } };
  await new DatabaseMigrator(pool as never).onModuleInit();
  assert.equal(calls.length, 1);
  assert.match(calls[0], /khedmah_taxi/);
  assert.match(calls[0], /profile_trust_gate/);
  assert.match(calls[0], /billing_admin/);
  assert.doesNotMatch(calls[0], /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i);
});

test('module initialization rejects before Nest application initialization completes', async () => {
  const pool = { query: async () => without((a) => a.name === 'food_promo_claims') };
  await assert.rejects(new DatabaseMigrator(pool as never).onModuleInit(), /CANONICAL_SCHEMA_INCOMPATIBLE/);
});
