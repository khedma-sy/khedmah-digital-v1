import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069M establishes one migration authority without implementation', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  assert.match(audit, /`backend\/migrations\/versions` is confirmed as the only future migration source/);
  assert.match(audit, /creates no migration, table, database adapter, connection, or runtime behavior/);
  assert.match(audit, /DATABASE LINEAGE STATUS: REQUIRES FURTHER RECONCILIATION/);
});

test('Mission 069M reports the complete 001 through 005 migration chain', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  for (const migration of ['001_core_identity_accounts', '002_create_profiles', '003_create_professional_profiles', '004_create_business_profiles', '005_create_organizations']) assert.match(audit, new RegExp(`\`${migration}\``));
  await access(new URL('../backend/migrations/versions/001_core_identity_accounts.sql', import.meta.url));
  await access(new URL('../backend/migrations/versions/001_core_identity_accounts_rollback.sql', import.meta.url));
  assert.match(audit, /002–004 have never existed in reachable history/);
  assert.match(audit, /No; do not restore/);
});

test('Mission 069M records Git recovery evidence and protects withdrawn 005', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  for (const commit of ['02ba522', '145341d', '9444ed2', '2bc97fe', '2fcb90b', '6ca6708']) assert.match(audit, new RegExp(`\`${commit}\``));
  assert.match(audit, /002–004:\*\* cannot be restored because no historical migration content exists/);
  assert.match(audit, /its text is recoverable with `git show`, but restoration is forbidden/);
});

test('Mission 069M quarantines every legacy SQL lineage concept', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  for (const table of ['user_accounts', 'user_profiles', 'audit_logs', 'organizations', 'organization_members', 'contact_inquiries', 'analytics_events']) assert.match(audit, new RegExp(`\`${table}\``));
  assert.match(audit, /They are a separate, incomplete, non-reversible lineage/);
  assert.match(audit, /`analytics_events`[\s\S]*tracking-shaped table/);
});

test('Mission 069M documents field dictionary conflicts and corrections', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  for (const topic of ['User table/key', 'Lifecycle', 'Profile fields', 'Professional profile', 'Business profile', 'Organization', 'Identifier vocabulary']) assert.match(audit, new RegExp(`\| ${topic} \|`));
  assert.match(audit, /Mission 046 remains a governance input, not SQL/);
  assert.match(audit, /do not silently rewrite 001/);
});

test('Mission 069M identifies in-memory runtime persistence and future boundaries', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  assert.match(audit, /executable NestJS runtime currently uses process-local Maps/);
  assert.match(audit, /There is no ORM, SQL driver, connection provider, migration invocation, or durable database configuration/);
  assert.match(audit, /No adapter is implemented or authorized here/);
});

test('Mission 069M chooses hybrid recovery and requires applied-state review', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  assert.match(audit, /Recommendation: Option C, governed hybrid recovery/);
  assert.match(audit, /determine whether any environment has applied it/);
  assert.match(audit, /Recreate—not restore—005/);
  assert.match(audit, /not authorization to create migrations/);
});

test('Mission 069M preserves security and KILL CRITICAL boundaries', async () => {
  const audit = await read('docs/audits/MISSION-069M-DATABASE-LINEAGE-RECOVERY-AUDIT.md');
  assert.match(audit, /No production database URL, hostname, username, password, API key, token, private key, or live credential value was found/);
  assert.match(audit, /legacy SQL must not be executed/);
  assert.match(audit, /KILL CRITICAL result: GOVERNED LINEAGE PASS; LEGACY TRACKING-SHAPED SQL QUARANTINED/);
  for (const forbidden of ['marketplace', 'payment', 'order', 'commission', 'advertising', 'ranking', 'social graph']) assert.match(audit, new RegExp(forbidden));
});
