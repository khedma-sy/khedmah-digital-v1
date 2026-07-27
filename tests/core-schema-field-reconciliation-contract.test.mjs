import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069O resolves all canonical identifier authorities', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  for (const identifier of ['identity_reference', 'user_identifier', 'profile_identifier', 'professional_profile_identifier', 'business_profile_identifier']) assert.match(contract, new RegExp(`\| \`${identifier}\` \|`));
  assert.match(contract, /All canonical identifiers are opaque, immutable TEXT values/);
  assert.match(contract, /Email, phone, display name, slug, runtime UUID.*must never be used as another entity's identifier/);
});

test('Mission 069O establishes lifecycle_status as the sole new lifecycle field', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  assert.match(contract, /There is one lifecycle authority: `lifecycle_status`/);
  assert.match(contract, /`profile_status`, `professional_status`, and `business_status` columns.*rejected/);
  for (const state of ['created', 'pending', 'active', 'suspended', 'archived']) assert.match(contract, new RegExp(`\\d\\. \`${state}\``));
  assert.match(contract, /No future table may add a generic `status`/);
});

test('Mission 069O fixes the required Profile fields and public-field disposition', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  for (const field of ['profile_identifier', 'user_identifier', 'profile_type', 'display_name', 'lifecycle_status', 'visibility', 'created_at', 'updated_at', 'archived_at']) assert.match(contract, new RegExp(`\| \`${field}\` \|`));
  assert.match(contract, /`public_name` \| \*\*Reject as a separate column/);
  assert.match(contract, /`arabic_name` \| \*\*Defer/);
  assert.match(contract, /`short_description` \| \*\*Defer/);
  assert.match(contract, /`public_slug` \| \*\*Defer/);
  assert.match(contract, /generic `public_fields`\/JSON \| \*\*Reject/);
});

test('Mission 069O fixes minimal Professional and Business Profile fields', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  for (const field of ['professional_profile_identifier', 'profession_type', 'business_profile_identifier', 'business_type']) assert.match(contract, new RegExp(`\| \`${field}\` \|`));
  assert.match(contract, /Certificates, licenses, documents, verification evidence.*booking.*payments.*explicitly excluded/s);
  assert.match(contract, /Products, catalogs, inventory, orders, carts, payments, financial data.*explicitly excluded/s);
  assert.match(contract, /Organization ownership is deferred/);
});

test('Mission 069O standardizes visibility and timestamps', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  assert.match(contract, /New tables use one column named `visibility`/);
  assert.match(contract, /It is not a permission, role, authentication result, ownership proof/);
  assert.match(contract, /`created_at` \| Required `TIMESTAMPTZ`/);
  assert.match(contract, /`updated_at` \| Required `TIMESTAMPTZ`/);
  assert.match(contract, /`archived_at` \| Nullable for non-archived rows; required for archived rows/);
  assert.match(contract, /No `deleted_at` is approved/);
});

test('Mission 069O prevents duplicate ownership, orphans, cascades, and cycles', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  assert.match(contract, /002 uniquely constrains `user_identifier`/);
  assert.match(contract, /003 and 004 each uniquely constrain `profile_identifier`/);
  assert.match(contract, /composite FKs.*preventing owner mismatch/);
  assert.match(contract, /`CASCADE` is forbidden/);
  assert.match(contract, /preventing 004↔005 circular dependency/);
});

test('Mission 069O records Mission 046 compatibility changes and deferrals', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  for (const heading of ['Compatible or normalized', 'Changed decisions', 'Deferred decisions', 'Rejected decisions']) assert.match(contract, new RegExp(`### ${heading}`));
  assert.match(contract, /TEXT opaque identifiers replace UUID physical keys/);
  assert.match(contract, /public_name` and `business_name` intent is normalized to required `display_name/);
});

test('Mission 069O preserves security and KILL CRITICAL exclusions', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  for (const forbidden of ['password', 'token', 'credential', 'session', 'private document', 'tracking identifier', 'payment/financial field']) assert.match(contract, new RegExp(forbidden));
  for (const critical of ['marketplace', 'order', 'commission', 'advertising', 'ranking', 'social graph', 'AI scoring']) assert.match(contract, new RegExp(critical));
  assert.match(contract, /KILL CRITICAL result: PASS/);
});

test('Mission 069O marks 002 through 004 fields ready while later implementation stays ordered', async () => {
  const contract = await read('docs/contracts/CORE-SCHEMA-FIELD-RECONCILIATION-CONTRACT.md');
  assert.match(contract, /CORE SCHEMA STATUS: READY FOR MIGRATION IMPLEMENTATION/);
  assert.match(contract, /There are no unresolved field blockers.*Migrations 002, 003, and 004/);
  assert.match(contract, /Mission 069O creates no SQL, table, index, migration, database connection, adapter, or runtime behavior/);
  await access(new URL('../backend/migrations/versions/002_create_profiles.sql', import.meta.url));
  await access(new URL('../backend/migrations/versions/003_create_professional_profiles.sql', import.meta.url));
  await assert.rejects(access(new URL('../backend/migrations/versions/004_create_business_profiles.sql', import.meta.url)));
});
