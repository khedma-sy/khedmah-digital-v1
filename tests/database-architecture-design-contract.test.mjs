import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/DATABASE-ARCHITECTURE-DESIGN-CONTRACT.md';

test('database architecture document exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# Database Architecture Design Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository was detected/);
});

test('database principles and all core entities exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Database Architecture Principles/);
  assert.match(doc, /naming conventions/);
  assert.match(doc, /entity ownership rules/);
  assert.match(doc, /relationship principles/);
  assert.match(doc, /indexing principles/);
  assert.match(doc, /privacy principles/);
  assert.match(doc, /audit principles/);
  for (const entity of [
    'User Accounts',
    'Profiles',
    'Professional Profiles',
    'Business Profiles',
    'Organizations',
    'Suppliers',
    'Partners',
    'Representatives',
    'Categories',
    'Services',
    'Locations',
    'Trust Records',
    'Audit Records',
  ]) {
    assert.match(doc, new RegExp(entity));
  }
});

test('identity, business, service, location, trust, relationship, and audit designs exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Identity Database Design/);
  assert.match(doc, /User Account\n↓\nProfile\n↓\nRoles\n↓\nPermissions/);
  assert.match(doc, /Business Database Design/);
  assert.match(doc, /duplicate ownership/);
  assert.match(doc, /supplier\/business confusion/);
  assert.match(doc, /Service Database Design/);
  assert.match(doc, /Category\n↓\nSubcategory\n↓\nService\n↓\nWorkflow Type/);
  assert.match(doc, /Do not create ordering/);
  assert.match(doc, /Location Database Design/);
  assert.match(doc, /Country\n↓\nCity\n↓\nArea\n↓\nService Coverage/);
  assert.match(doc, /Trust & Verification Database Design/);
  assert.match(doc, /self verification/);
  assert.match(doc, /Relationship Database Design/);
  assert.match(doc, /Organization Members/);
  assert.match(doc, /Partner Relationships/);
  assert.match(doc, /Representative Assignments/);
  assert.match(doc, /Audit Database Design/);
  assert.match(doc, /actor/);
  assert.match(doc, /previous state/);
  assert.match(doc, /new state/);
});

test('privacy, indexing, scalability, kill-critical, and V1 boundaries exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Index & Performance Strategy/);
  assert.match(doc, /Search Fields/);
  assert.match(doc, /Unique Fields/);
  assert.match(doc, /Relationship Lookups/);
  assert.match(doc, /Location Queries/);
  assert.match(doc, /Status Queries/);
  assert.match(doc, /Data Privacy Review/);
  assert.match(doc, /Public/);
  assert.match(doc, /Private/);
  assert.match(doc, /Internal/);
  assert.match(doc, /No private data exposure/);
  assert.match(doc, /No secrets/);
  assert.match(doc, /No credentials/);
  assert.match(doc, /No tokens/);
  assert.match(doc, /Migration & Scalability Review/);
  assert.match(doc, /schema growth/);
  assert.match(doc, /multi-region support/);
  assert.match(doc, /data migration complexity/);
  assert.match(doc, /KILL CRITICAL Database Review/);
  assert.match(doc, /Marketplace database drift/);
  assert.match(doc, /Payment tables/);
  assert.match(doc, /Commission tables/);
  assert.match(doc, /Advertising tables/);
  assert.match(doc, /Ranking tables/);
  assert.match(doc, /Social network tables/);
  assert.match(doc, /AI tracking tables/);
  assert.match(doc, /database models/);
  assert.match(doc, /migrations/);
  assert.match(doc, /APIs/);
});

test('RTL Arabic direction remains preserved for database architecture readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
