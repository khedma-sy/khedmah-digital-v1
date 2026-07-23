import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/FIRST-DATABASE-MIGRATION-ROLLBACK-PLAYBOOK-CONTRACT.md';

test('migration contract exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# First Database Migration Plan & Rollback Playbook Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository detected/);
});

test('migration strategy, creation order, dependency rules, and scope exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Migration Strategy Principles/);
  assert.match(doc, /migration versioning rules/);
  assert.match(doc, /migration naming conventions/);
  assert.match(doc, /migration ordering principles/);
  assert.match(doc, /backward compatibility principles/);
  assert.match(doc, /Mission 043/);
  assert.match(doc, /Mission 047/);
  assert.match(doc, /Initial Database Creation Order/);
  assert.match(doc, /system configuration/);
  assert.match(doc, /audit foundation/);
  assert.match(doc, /roles and permissions/);
  assert.match(doc, /trust records/);
  assert.match(doc, /Dependency Analysis/);
  assert.match(doc, /circular dependency risks/);
  assert.match(doc, /First Migration Scope Definition/);
  assert.match(doc, /Migration 001/);
});

test('rollback strategy, data safety, migration testing, and environment separation exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Rollback Playbook/);
  assert.match(doc, /rollback triggers/);
  assert.match(doc, /failure detection/);
  assert.match(doc, /data protection/);
  assert.match(doc, /backup requirements/);
  assert.match(doc, /recovery steps/);
  assert.match(doc, /audit requirements/);
  assert.match(doc, /Data Safety Rules/);
  assert.match(doc, /user data/);
  assert.match(doc, /business data/);
  assert.match(doc, /verification data/);
  assert.match(doc, /trust data/);
  assert.match(doc, /audit history/);
  assert.match(doc, /Migration Testing Strategy/);
  assert.match(doc, /schema validation/);
  assert.match(doc, /relationship validation/);
  assert.match(doc, /constraint testing/);
  assert.match(doc, /rollback testing/);
  assert.match(doc, /data integrity testing/);
  assert.match(doc, /Environment Separation/);
  assert.match(doc, /Development\n↓\nTesting\n↓\nStaging\n↓\nProduction/);
});

test('seed rules, audit requirements, kill-critical review, backend readiness, and boundaries exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Seed Data Migration Rules/);
  assert.match(doc, /roles/);
  assert.match(doc, /permissions/);
  assert.match(doc, /categories/);
  assert.match(doc, /locations/);
  assert.match(doc, /workflow types/);
  assert.match(doc, /trust levels/);
  assert.match(doc, /fake users/);
  assert.match(doc, /fake companies/);
  assert.match(doc, /fake ratings/);
  assert.match(doc, /fake verification/);
  assert.match(doc, /Audit & Compliance Review/);
  assert.match(doc, /migration version/);
  assert.match(doc, /actor/);
  assert.match(doc, /rollback information/);
  assert.match(doc, /KILL CRITICAL Migration Review/);
  assert.match(doc, /Accidental marketplace schema creation/);
  assert.match(doc, /Payment schema creation/);
  assert.match(doc, /Commission schema creation/);
  assert.match(doc, /Advertising schema creation/);
  assert.match(doc, /Tracking schema creation/);
  assert.match(doc, /Social graph schema creation/);
  assert.match(doc, /unnecessary personal data storage/i);
  assert.match(doc, /Backend Readiness Assessment/);
  assert.match(doc, /Mission 049/);
  assert.match(doc, /98 \/ 100/);
  assert.match(doc, /database migrations/);
  assert.match(doc, /database tables/);
  assert.match(doc, /ORM models/);
  assert.match(doc, /deployment scripts/);
  assert.match(doc, /APIs/);
});

test('RTL Arabic direction remains preserved for migration planning readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
