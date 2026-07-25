import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069N confirms migration authority while later missions preserve dependency order', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  assert.match(plan, /Official migration source \| `backend\/migrations\/versions` only/);
  assert.match(plan, /`infra\/database` is not a migration source/);
  assert.match(plan, /creates no SQL, table, index, foreign key, runtime adapter, or persistence behavior/);
  await access(new URL('../backend/migrations/versions/002_create_profiles.sql', import.meta.url));
  await access(new URL('../backend/migrations/versions/003_create_professional_profiles.sql', import.meta.url));
  await assert.rejects(access(new URL('../backend/migrations/versions/004_create_business_profiles.sql', import.meta.url)));
});

test('Mission 069N reviews Migration 001 without rewriting it', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  for (const field of ['user_identifier', 'identity_reference', 'account_type', 'account_status', 'lifecycle_status', 'visibility_classification', 'created_at', 'updated_at', 'archived_at']) assert.match(plan, new RegExp(`\`${field}\``));
  assert.match(plan, /an applied 001 must never be edited in place/);
  assert.match(plan, /Whether 001 has been applied in any environment/);
});

test('Mission 069N defines the exact minimal Migration 002 plan', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  assert.match(plan, /`002_create_profiles\.sql` creates the base public-identity representation/);
  for (const field of ['profile_identifier', 'user_identifier', 'profile_type', 'profile_status', 'visibility', 'lifecycle_status', 'created_at', 'updated_at', 'archived_at']) assert.match(plan, new RegExp(`\`${field}\``));
  assert.match(plan, /Unique owner relationship for the first slice/);
  assert.match(plan, /public_name.*not authorized.*missing Mission 068/s);
});

test('Mission 069N defines Professional Profile ownership and constraints', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  for (const value of ['professional_profile_identifier', 'profession_type', 'professional_status', 'professional_profile']) assert.match(plan, new RegExp(`\`${value}\``));
  assert.match(plan, /Composite FK `\(profile_identifier, user_identifier\)`.*prevents owner mismatch/);
  assert.match(plan, /One professional identity per base profile/);
  assert.match(plan, /credentials, certificates, verification evidence, services, booking, payments/);
});

test('Mission 069N defines Business Profile ownership and scope boundaries', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  for (const value of ['business_profile_identifier', 'business_type', 'business_status', 'business_profile']) assert.match(plan, new RegExp(`\`${value}\``));
  assert.match(plan, /Composite FK `\(profile_identifier, user_identifier\)` prevents mismatch/);
  assert.match(plan, /Organization ownership is \*\*not\*\* included/);
  assert.match(plan, /business name\/category.*blocker/);
});

test('Mission 069N fixes dependency, identifier, lifecycle, and visibility rules', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  assert.match(plan, /001_core_identity_accounts[\s\S]*002_create_profiles[\s\S]*003_create_[\s\S]*004_create_/);
  for (const identifier of ['identity_reference', 'user_identifier', 'profile_identifier', 'professional_profile_identifier', 'business_profile_identifier']) assert.match(plan, new RegExp(`\`${identifier}\``));
  assert.match(plan, /All five identifiers are opaque and immutable/);
  assert.match(plan, /Created → Pending or Archived/);
  assert.match(plan, /Public, Private, and Internal visibility/);
});

test('Mission 069N defines dependency-safe rollback and future tests', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  assert.match(plan, /full reversal is 004 and 003 in either order, then 002/);
  assert.match(plan, /`CASCADE` is forbidden/);
  for (const testArea of ['Static migration tests', 'PostgreSQL integration tests', 'Contract and security tests']) assert.match(plan, new RegExp(`### ${testArea}`));
  assert.match(plan, /rollback restores the prior schema inventory and preserves 001\/unrelated objects/);
});

test('Mission 069N preserves legacy and KILL CRITICAL protection', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  for (const forbidden of ['password/password hash', 'session/session reference', 'tracking/anonymous identifier', 'payment/financial data', 'seller/marketplace field', 'commission', 'advertising', 'ranking', 'social graph', 'AI scoring']) assert.match(plan, new RegExp(forbidden));
  assert.match(plan, /must not copy legacy `user_profiles`/);
  assert.match(plan, /No seed data is planned/);
});

test('Mission 069N reports the missing contracts and blocks implementation', async () => {
  const plan = await read('docs/contracts/MIGRATION-RECONSTRUCTION-PLAN.md');
  assert.match(plan, /Mission 068 Profile Database Contract and Mission 069 Specialized Profile Decisions are not present/);
  assert.match(plan, /MIGRATION RECONSTRUCTION STATUS: REQUIRES FURTHER RECONCILIATION/);
  assert.match(plan, /No SQL migration may be created from provisional\/deferred decisions/);
});
