import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/PHYSICAL-DATABASE-SCHEMA-REVIEW-MIGRATION-SAFETY-CONTRACT.md';

test('physical schema review exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# Physical Database Schema Review & Migration Safety Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository detected/);
});

test('architecture compatibility and physical schema mapping exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Previous Architecture Compatibility Review/);
  assert.match(doc, /Mission 043 Architecture Freeze/);
  assert.match(doc, /Mission 044 Database Architecture Design/);
  assert.match(doc, /Mission 045 ERD Table Naming Contract/);
  assert.match(doc, /Mission 046 Field Dictionary Contract/);
  assert.match(doc, /Physical Schema Mapping Review/);
  for (const table of [
    'users',
    'profiles',
    'professional_profiles',
    'business_profiles',
    'organizations',
    'organization_members',
    'suppliers',
    'partners',
    'representatives',
    'categories',
    'services',
    'locations',
    'trust_records',
    'verification_records',
    'audit_records',
  ]) {
    assert.match(doc, new RegExp(table));
  }
  assert.match(doc, /primary key strategy/);
  assert.match(doc, /foreign key\/reference strategy/);
  assert.match(doc, /required fields/);
  assert.match(doc, /lifecycle fields/);
  assert.match(doc, /ownership references/);
});

test('migration safety, relationship integrity, lifecycle, archive, and security reviews exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Relationship Integrity Review/);
  assert.match(doc, /One-to-One/);
  assert.match(doc, /One-to-Many/);
  assert.match(doc, /Many-to-Many/);
  assert.match(doc, /ownership integrity/);
  assert.match(doc, /orphan prevention/);
  assert.match(doc, /Migration Safety Review/);
  assert.match(doc, /adding fields/);
  assert.match(doc, /renaming fields/);
  assert.match(doc, /backward compatibility/);
  assert.match(doc, /Data Lifecycle Review/);
  assert.match(doc, /Created\n↓\nPending\n↓\nActive\n↓\nSuspended\n↓\nArchived/);
  assert.match(doc, /Soft Delete & Archive Strategy/);
  assert.match(doc, /archive behavior/);
  assert.match(doc, /restoration principles/);
  assert.match(doc, /Security Database Review/);
  assert.match(doc, /private user data/);
  assert.match(doc, /verification evidence/);
  assert.match(doc, /internal operational data/);
  assert.match(doc, /ownership information/);
});

test('performance, duplicates, seed boundaries, kill-critical, readiness, and V1 boundaries exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Database Performance Review/);
  assert.match(doc, /indexes/);
  assert.match(doc, /relationship queries/);
  assert.match(doc, /location queries/);
  assert.match(doc, /service discovery queries/);
  assert.match(doc, /status filtering/);
  assert.match(doc, /Duplicate Prevention Final Review/);
  assert.match(doc, /duplicate users/);
  assert.match(doc, /duplicate businesses/);
  assert.match(doc, /duplicate professionals/);
  assert.match(doc, /duplicate services/);
  assert.match(doc, /duplicate relationships/);
  assert.match(doc, /Seed & Initial Data Safety Review/);
  assert.match(doc, /roles/);
  assert.match(doc, /permissions/);
  assert.match(doc, /workflow types/);
  assert.match(doc, /fake production data/);
  assert.match(doc, /KILL CRITICAL Database Final Audit/);
  assert.match(doc, /Marketplace database structures/);
  assert.match(doc, /Payment structures/);
  assert.match(doc, /Commission structures/);
  assert.match(doc, /Advertising structures/);
  assert.match(doc, /Ranking structures/);
  assert.match(doc, /Social graph structures/);
  assert.match(doc, /AI tracking structures/);
  assert.match(doc, /97 \/ 100/);
  assert.match(doc, /database tables/);
  assert.match(doc, /collections/);
  assert.match(doc, /migrations/);
  assert.match(doc, /ORM models/);
  assert.match(doc, /APIs/);
});

test('RTL Arabic direction remains preserved for physical schema readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
