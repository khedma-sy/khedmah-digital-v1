import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/DATABASE-FIELD-DICTIONARY-CONSTRAINTS-SEED-DATA-CONTRACT.md';

test('field dictionary document exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# Database Field Dictionary, Constraints & Seed Data Boundary Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository was detected/);
});

test('field principles and entity fields exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Field Dictionary Principles/);
  assert.match(doc, /field naming/);
  assert.match(doc, /data types/);
  assert.match(doc, /nullable rules/);
  assert.match(doc, /default values/);
  assert.match(doc, /required fields/);
  assert.match(doc, /visibility classification/);
  assert.match(doc, /edit permissions/);
  assert.match(doc, /User Account Field Dictionary/);
  assert.match(doc, /users/);
  assert.match(doc, /Profile Field Dictionary/);
  assert.match(doc, /profiles/);
  assert.match(doc, /Professional Profile Fields/);
  assert.match(doc, /professional_profiles/);
  assert.match(doc, /Business Profile Fields/);
  assert.match(doc, /business_profiles/);
  assert.match(doc, /Organization & Supplier Fields/);
  assert.match(doc, /organizations/);
  assert.match(doc, /suppliers/);
  assert.match(doc, /Service Catalog Fields/);
  assert.match(doc, /categories/);
  assert.match(doc, /subcategories/);
  assert.match(doc, /services/);
  assert.match(doc, /workflow_types/);
  assert.match(doc, /Location Fields/);
  assert.match(doc, /countries/);
  assert.match(doc, /cities/);
  assert.match(doc, /areas/);
  assert.match(doc, /service_coverages/);
  assert.match(doc, /Trust & Verification Fields/);
  assert.match(doc, /trust_records/);
  assert.match(doc, /verification_records/);
  assert.match(doc, /Relationship Fields/);
  assert.match(doc, /organization_members/);
  assert.match(doc, /partner_relationships/);
  assert.match(doc, /representative_assignments/);
});

test('constraints, visibility rules, seed boundaries, and duplicate rules exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Constraint Rules/);
  assert.match(doc, /Unique Constraints/);
  assert.match(doc, /Foreign Key Rules/);
  assert.match(doc, /Required Relationships/);
  assert.match(doc, /Status Constraints/);
  assert.match(doc, /Deletion Rules/);
  assert.match(doc, /Update Rules/);
  assert.match(doc, /Public/);
  assert.match(doc, /Private/);
  assert.match(doc, /Internal/);
  assert.match(doc, /Seed Data Boundary Contract/);
  assert.match(doc, /System roles/);
  assert.match(doc, /service categories/);
  assert.match(doc, /locations/);
  assert.match(doc, /workflow types/);
  assert.match(doc, /Fake users/);
  assert.match(doc, /Fake businesses/);
  assert.match(doc, /Fake ratings/);
  assert.match(doc, /Fake trust scores/);
  assert.match(doc, /Data Quality & Duplicate Prevention/);
  assert.match(doc, /Duplicate users/);
  assert.match(doc, /Duplicate businesses/);
  assert.match(doc, /Duplicate professionals/);
  assert.match(doc, /Duplicate services/);
});

test('kill-critical review and V1 boundaries are preserved', async () => {
  const doc = await read(docPath);

  assert.match(doc, /KILL CRITICAL Database Review/);
  assert.match(doc, /Payment fields/);
  assert.match(doc, /Commission fields/);
  assert.match(doc, /Advertising fields/);
  assert.match(doc, /Ranking fields/);
  assert.match(doc, /Social activity fields/);
  assert.match(doc, /Unnecessary tracking fields/);
  assert.match(doc, /database tables/);
  assert.match(doc, /collections/);
  assert.match(doc, /migrations/);
  assert.match(doc, /database connections/);
  assert.match(doc, /seed scripts/);
  assert.match(doc, /APIs/);
  assert.match(doc, /backend code/);
  assert.match(doc, /frontend code/);
});

test('RTL Arabic direction remains preserved for field dictionary readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
