import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('implementation-ready field schema validation contract exists and records repository identity', async () => {
  const doc = await read('docs/contracts/IMPLEMENTATION-READY-FIELD-SCHEMA-VALIDATION-CONTRACT.md');

  assert.match(doc, /# Implementation-Ready Field Schema & Validation Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('schema contract defines schema principles, visibility classes, and entity schemas', async () => {
  const doc = await read('docs/contracts/IMPLEMENTATION-READY-FIELD-SCHEMA-VALIDATION-CONTRACT.md');

  assert.match(doc, /Field name/);
  assert.match(doc, /Purpose/);
  assert.match(doc, /Data type/);
  assert.match(doc, /Required \/ Optional/);
  assert.match(doc, /Public \/ Private visibility/);
  assert.match(doc, /Validation rules/);
  assert.match(doc, /Public data/);
  assert.match(doc, /Private data/);
  assert.match(doc, /Internal operational data/);
  assert.match(doc, /User Account Schema Contract/);
  assert.match(doc, /Professional Profile Schema Contract/);
  assert.match(doc, /Business Profile Schema Contract/);
  assert.match(doc, /Organization Schema Contract/);
  assert.match(doc, /Supplier Schema Contract/);
});

test('schema contract defines service catalog, location, trust, and relationship schemas', async () => {
  const doc = await read('docs/contracts/IMPLEMENTATION-READY-FIELD-SCHEMA-VALIDATION-CONTRACT.md');

  assert.match(doc, /Category\n↓\nSubcategory\n↓\nService\n↓\nWorkflow Type/);
  assert.match(doc, /Medical consultation/);
  assert.match(doc, /Restaurant food service/);
  assert.match(doc, /Computer maintenance/);
  assert.match(doc, /Camera installation/);
  assert.match(doc, /Construction service/);
  assert.match(doc, /Country\n↓\nCity\n↓\nArea\n↓\nService Coverage/);
  assert.match(doc, /Business location/);
  assert.match(doc, /Branch location/);
  assert.match(doc, /Professional location/);
  assert.match(doc, /Service coverage area/);
  assert.match(doc, /Partner coverage area/);
  assert.match(doc, /verification_status/);
  assert.match(doc, /trust_level/);
  assert.match(doc, /User → Profile/);
  assert.match(doc, /Organization → Members/);
  assert.match(doc, /Business → Services/);
  assert.match(doc, /Representative → Relationship scope/);
});

test('schema contract defines validation, ownership, trust protection, and V1 boundaries', async () => {
  const doc = await read('docs/contracts/IMPLEMENTATION-READY-FIELD-SCHEMA-VALIDATION-CONTRACT.md');

  assert.match(doc, /Required fields/);
  assert.match(doc, /Format validation/);
  assert.match(doc, /Allowed values/);
  assert.match(doc, /Status transitions/);
  assert.match(doc, /Ownership validation/);
  assert.match(doc, /Visibility validation/);
  assert.match(doc, /Prevent duplicate ownership/);
  assert.match(doc, /Users cannot edit their own trust/);
  assert.match(doc, /Owners cannot edit verification decisions/);
  assert.match(doc, /Representatives cannot modify trust/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /Database/);
  assert.match(doc, /APIs/);
  assert.match(doc, /Authentication/);
  assert.match(doc, /Authorization/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Ordering/);
  assert.match(doc, /Delivery/);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Subscriptions/);
  assert.match(doc, /AI/);
  assert.match(doc, /Advertising/);
});

test('RTL Arabic direction remains preserved for schema contract readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
