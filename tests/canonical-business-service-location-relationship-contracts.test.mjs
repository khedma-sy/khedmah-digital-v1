import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical reconciliation contract document exists and records repository identity', async () => {
  const doc = await read('docs/contracts/CANONICAL-BUSINESS-SERVICE-LOCATION-RELATIONSHIP-CONTRACTS.md');

  assert.match(doc, /# Canonical Business Profile, Service Catalog, Location & Relationship Contracts/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('canonical contract defines business profile and professional profile principles', async () => {
  const doc = await read('docs/contracts/CANONICAL-BUSINESS-SERVICE-LOCATION-RELATIONSHIP-CONTRACTS.md');

  assert.match(doc, /A Business Profile is the canonical public-facing profile/);
  assert.match(doc, /Who owns the profile/);
  assert.match(doc, /Who manages it/);
  assert.match(doc, /Who can represent it/);
  assert.match(doc, /Who can provide services through it/);
  assert.match(doc, /Individual Professional/);
  assert.match(doc, /Doctor/);
  assert.match(doc, /Business/);
  assert.match(doc, /Restaurant/);
  assert.match(doc, /Organization/);
  assert.match(doc, /Factory/);
  assert.match(doc, /Supplier/);
  assert.match(doc, /Professional Profile is the canonical identity/);
  assert.match(doc, /Professional identity vs Business identity/);
});

test('canonical contract defines service catalog, relationship, location, trust, and Job Work compatibility', async () => {
  const doc = await read('docs/contracts/CANONICAL-BUSINESS-SERVICE-LOCATION-RELATIONSHIP-CONTRACTS.md');

  assert.match(doc, /A Service is an independent platform concept/);
  assert.match(doc, /Business\n↓\nService\n↓\nWorkflow Type\n↓\nJob Work/);
  assert.match(doc, /User\n↓\nProfile\n↓\nOrganization \/ Business\n↓\nServices\n↓\nPartners \/ Representatives\n↓\nCustomers/);
  assert.match(doc, /Country\n↓\nCity\n↓\nArea\n↓\nService Coverage/);
  assert.match(doc, /Business location vs Service Coverage Area/);
  assert.match(doc, /Trust can attach to multiple entities/);
  assert.match(doc, /Service\n↓\nJob Type\n↓\nWorkflow\n↓\nProvider \/ Worker\n↓\nCompletion History\n↓\nTrust/);
});

test('canonical contract verifies taxonomy examples and V1 boundaries', async () => {
  const doc = await read('docs/contracts/CANONICAL-BUSINESS-SERVICE-LOCATION-RELATIONSHIP-CONTRACTS.md');

  assert.match(doc, /Business Type\n↓\nCategory\n↓\nSubcategory\n↓\nService\n↓\nWorkflow Type\n↓\nLocation\n↓\nTrust Level/);
  assert.match(doc, /Doctors/);
  assert.match(doc, /Dentists/);
  assert.match(doc, /Engineers/);
  assert.match(doc, /Lawyers/);
  assert.match(doc, /Restaurants/);
  assert.match(doc, /Supermarkets/);
  assert.match(doc, /Real Estate/);
  assert.match(doc, /Tourism/);
  assert.match(doc, /Education/);
  assert.match(doc, /Technology/);
  assert.match(doc, /Implemented V1 Category Contract/);
  assert.match(doc, /15 active parentless root records/);
  assert.match(doc, /99 active leaf records/);
  assert.match(doc, /New or changed Business Profile and Service Listing category selections require an active leaf/);
  assert.match(doc, /Discovery accepts a root or leaf/);
  assert.match(doc, /Web and Android must preserve the hierarchy/);
  assert.match(doc, /alias arrays remain server-side search fields/);
  assert.match(doc, /not part of the public Category payload/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Ordering/);
  assert.match(doc, /Delivery system/);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Subscriptions/);
  assert.match(doc, /Social network/);
  assert.match(doc, /AI/);
  assert.match(doc, /Advertising/);
  assert.match(doc, /Ranking/);
});

test('RTL Arabic direction remains preserved for canonical contract readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
