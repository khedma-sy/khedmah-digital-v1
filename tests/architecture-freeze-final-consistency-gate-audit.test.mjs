import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = async (path) => access(new URL(`../${path}`, import.meta.url)).then(() => true, () => false);
const auditPath = 'docs/audits/MISSION-043-ARCHITECTURE-FREEZE-FINAL-CONSISTENCY-GATE-AUDIT.md';

test('architecture freeze document exists and records repository identity', async () => {
  const doc = await read(auditPath);

  assert.match(doc, /# Mission 043 — Architecture Freeze & Final Consistency Gate Audit/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository was detected/);
});

test('all foundation references exist in the repository and audit inventory', async () => {
  const doc = await read(auditPath);
  const foundations = [
    'docs/product/UNIVERSAL-TAXONOMY-MODEL.md',
    'docs/architecture/PUBLIC-DISCOVERY-EXPERIENCE-BLUEPRINT.md',
    'docs/architecture/TRUST-VERIFICATION-FOUNDATION.md',
    'docs/architecture/KHEDMAH-SHARING-FOUNDATION.md',
    'docs/architecture/JOB-WORK-FOUNDATION.md',
    'docs/architecture/PARTNER-REPRESENTATIVE-NETWORK-FOUNDATION.md',
    'docs/architecture/ANALYTICS-MARKET-INTELLIGENCE-FOUNDATION.md',
    'docs/audits/MISSION-036A-FULL-ARCHITECTURE-CONSISTENCY-AUDIT.md',
    'docs/contracts/CANONICAL-BUSINESS-SERVICE-LOCATION-RELATIONSHIP-CONTRACTS.md',
    'docs/contracts/IDENTITY-ROLE-PERMISSION-ACCOUNT-LIFECYCLE-CONTRACT.md',
    'docs/contracts/FIELD-PERMISSION-LIFECYCLE-AUDIT-CONTRACT.md',
    'docs/contracts/IMPLEMENTATION-READY-FIELD-SCHEMA-VALIDATION-CONTRACT.md',
    'docs/contracts/API-PAYLOAD-VALIDATION-ERROR-AUDIT-EVENT-CONTRACT.md',
    'docs/contracts/MODULE-API-ROUTE-ERROR-DIAGNOSIS-AUDIT-CONTRACT.md',
    'docs/contracts/PLATFORM-OWNED-ORGANIZATION-OFFICIAL-PROFILE-CONTRACT.md',
  ];

  for (const foundation of foundations) {
    assert.equal(await exists(foundation), true, `${foundation} should exist`);
    assert.match(doc, new RegExp(foundation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('entity, relationship, taxonomy, permission, visibility, error, and platform consistency exist', async () => {
  const doc = await read(auditPath);

  assert.match(doc, /Entity Consistency Audit/);
  assert.match(doc, /User\nProfile\nProfessional Profile\nBusiness Profile\nOrganization\nSupplier\nPartner\nRepresentative\nService\nCategory\nLocation\nTrust\nAudit/);
  assert.match(doc, /Relationship Freeze Audit/);
  assert.match(doc, /User → Profile/);
  assert.match(doc, /Organization → Members/);
  assert.match(doc, /Entity → Audit/);
  assert.match(doc, /Taxonomy Freeze Audit/);
  assert.match(doc, /Business Type\n↓\nCategory\n↓\nSubcategory\n↓\nService\n↓\nWorkflow Type\n↓\nLocation\n↓\nTrust Level/);
  assert.match(doc, /Doctors/);
  assert.match(doc, /Restaurants/);
  assert.match(doc, /Technology services/);
  assert.match(doc, /Permission & Ownership Freeze/);
  assert.match(doc, /Owner/);
  assert.match(doc, /Representative/);
  assert.match(doc, /Data Visibility Freeze/);
  assert.match(doc, /Public Data/);
  assert.match(doc, /Private Data/);
  assert.match(doc, /Internal Operational Data/);
  assert.match(doc, /Error & Audit Readiness Review/);
  assert.match(doc, /API Error Contract\n↓\nValidation Rules\n↓\nLifecycle Rules\n↓\nAudit Events/);
  assert.match(doc, /Platform-Owned Organization Review/);
  assert.match(doc, /Official Business Profile/);
});

test('kill-critical audit, database readiness, boundaries, and readiness score exist', async () => {
  const doc = await read(auditPath);

  assert.match(doc, /KILL CRITICAL Final Audit/);
  assert.match(doc, /Marketplace drift/);
  assert.match(doc, /Payment drift/);
  assert.match(doc, /Delivery drift/);
  assert.match(doc, /Social network drift/);
  assert.match(doc, /AI drift/);
  assert.match(doc, /Advertising drift/);
  assert.match(doc, /Ranking drift/);
  assert.match(doc, /Commission drift/);
  assert.match(doc, /Privacy risks/);
  assert.match(doc, /Ownership risks/);
  assert.match(doc, /Database Readiness Assessment/);
  assert.match(doc, /READY WITH CONDITIONS/);
  assert.match(doc, /database models/);
  assert.match(doc, /migrations/);
  assert.match(doc, /APIs/);
  assert.match(doc, /backend code/);
  assert.match(doc, /frontend code/);
  assert.match(doc, /payments/);
  assert.match(doc, /marketplace features/);
  assert.match(doc, /93 \/ 100/);
});

test('RTL Arabic direction remains preserved for architecture freeze readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
