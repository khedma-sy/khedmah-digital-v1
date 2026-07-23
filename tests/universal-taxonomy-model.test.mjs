import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('universal taxonomy documentation exists and defines the approved hierarchy', async () => {
  const doc = await read('docs/product/UNIVERSAL-TAXONOMY-MODEL.md');

  assert.match(doc, /# Universal Business & Service Taxonomy Model/);
  assert.match(doc, /Individual Professional/);
  assert.match(doc, /Business/);
  assert.match(doc, /Factory/);
  assert.match(doc, /Supplier/);
  assert.match(doc, /Partner/);
  assert.match(doc, /Representative/);
  assert.match(doc, /Broker/);
  assert.match(doc, /Business Type\n↓\nCategory\n↓\nSubcategory\n↓\nService\n↓\nWorkflow Type\n↓\nLocation\n↓\nTrust Level/);
  assert.match(doc, /Doctor/);
  assert.match(doc, /Restaurant/);
  assert.match(doc, /Engineer/);
  assert.match(doc, /Marketer/);
});

test('universal taxonomy preserves V1 documentation-only boundaries', async () => {
  const doc = await read('docs/product/UNIVERSAL-TAXONOMY-MODEL.md');

  assert.match(doc, /documentation-only taxonomy foundation/i);
  assert.match(doc, /does not create marketplace, payments, ordering, commissions, delivery, messaging, AI, backend APIs, frontend screens, database models, migrations, workflows, automations, or production infrastructure/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Ordering/);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Delivery/);
  assert.match(doc, /Messaging/);
  assert.match(doc, /AI/);
});
