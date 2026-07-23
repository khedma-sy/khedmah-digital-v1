import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/DATABASE-ERD-TABLE-NAMING-CONTRACT.md';

test('ERD contract exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# Database Entity Relationship Diagram & Table Naming Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository was detected/);
});

test('naming rules and core ERD design exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Database Naming Convention Contract/);
  assert.match(doc, /table naming/);
  assert.match(doc, /column naming/);
  assert.match(doc, /primary key naming/);
  assert.match(doc, /foreign key naming/);
  assert.match(doc, /timestamp naming/);
  assert.match(doc, /status field naming/);
  assert.match(doc, /users/);
  assert.match(doc, /user_id/);
  assert.match(doc, /created_at/);
  assert.match(doc, /updated_at/);
  assert.match(doc, /Core ERD Design/);
  assert.match(doc, /One-to-many/);
  assert.match(doc, /One-to-zero-or-one/);
  assert.match(doc, /Many-to-many/);
});

test('identity, business, professional, service, location, trust, partner, and audit relationships exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Identity Relationship Design/);
  assert.match(doc, /users/);
  assert.match(doc, /profiles/);
  assert.match(doc, /roles/);
  assert.match(doc, /permissions/);
  assert.match(doc, /role_assignments/);
  assert.match(doc, /permission_assignments/);
  assert.match(doc, /Business & Organization ERD/);
  assert.match(doc, /Organization Members/);
  assert.match(doc, /Business Profiles/);
  assert.match(doc, /Professional Profile ERD/);
  assert.match(doc, /Doctor/);
  assert.match(doc, /Engineer/);
  assert.match(doc, /Lawyer/);
  assert.match(doc, /Consultant/);
  assert.match(doc, /Service Catalog ERD/);
  assert.match(doc, /Categories\n↓\nSubcategories\n↓\nServices\n↓\nWorkflow Types/);
  assert.match(doc, /Location ERD/);
  assert.match(doc, /Countries\n↓\nCities\n↓\nAreas\n↓\nService Coverage/);
  assert.match(doc, /Trust & Verification ERD/);
  assert.match(doc, /Trust Records/);
  assert.match(doc, /Verification Records/);
  assert.match(doc, /Audit References/);
  assert.match(doc, /Partner & Representative ERD/);
  assert.match(doc, /Representative Assignments/);
  assert.match(doc, /Audit ERD/);
  assert.match(doc, /actor reference/);
  assert.match(doc, /old value reference/);
  assert.match(doc, /new value reference/);
});

test('integrity rules, indexes, migration risks, kill-critical, and boundaries exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Database Integrity Rules/);
  assert.match(doc, /Unique Constraints/);
  assert.match(doc, /Relationship Constraints/);
  assert.match(doc, /Deletion Rules/);
  assert.match(doc, /Update Rules/);
  assert.match(doc, /Status Transition Rules/);
  assert.match(doc, /Indexing Relationship Review/);
  assert.match(doc, /unique identifiers/);
  assert.match(doc, /relationships/);
  assert.match(doc, /locations/);
  assert.match(doc, /statuses/);
  assert.match(doc, /search foundations/);
  assert.match(doc, /Do not create ranking indexes/);
  assert.match(doc, /Migration Risk Review/);
  assert.match(doc, /future schema changes/);
  assert.match(doc, /entity expansion/);
  assert.match(doc, /multi-region support/);
  assert.match(doc, /data migration risks/);
  assert.match(doc, /KILL CRITICAL Database Audit/);
  assert.match(doc, /No marketplace tables/);
  assert.match(doc, /No payment tables/);
  assert.match(doc, /No commission tables/);
  assert.match(doc, /No advertising tables/);
  assert.match(doc, /No social graph tables/);
  assert.match(doc, /No AI tracking tables/);
  assert.match(doc, /database tables/);
  assert.match(doc, /collections/);
  assert.match(doc, /migrations/);
  assert.match(doc, /APIs/);
});

test('RTL Arabic direction remains preserved for ERD readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
