import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('module API route error diagnosis audit contract exists and records repository identity', async () => {
  const doc = await read('docs/contracts/MODULE-API-ROUTE-ERROR-DIAGNOSIS-AUDIT-CONTRACT.md');

  assert.match(doc, /# Module API Route Contract, Error Diagnosis, Auto Specification & Critical Consistency Audit/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('module API blueprint and error diagnosis model exist', async () => {
  const doc = await read('docs/contracts/MODULE-API-ROUTE-ERROR-DIAGNOSIS-AUDIT-CONTRACT.md');

  assert.match(doc, /Identity Module/);
  assert.match(doc, /Business Module/);
  assert.match(doc, /Services Module/);
  assert.match(doc, /Trust Module/);
  assert.match(doc, /Discovery Module/);
  assert.match(doc, /Relationships Module/);
  assert.match(doc, /Error Code/);
  assert.match(doc, /Error Name/);
  assert.match(doc, /Affected Module/);
  assert.match(doc, /Suggested Resolution/);
  assert.match(doc, /BUSINESS_PROFILE_DUPLICATE/);
});

test('error classifications, duplicate rules, and conflict analysis exist', async () => {
  const doc = await read('docs/contracts/MODULE-API-ROUTE-ERROR-DIAGNOSIS-AUDIT-CONTRACT.md');

  assert.match(doc, /VALIDATION_ERROR/);
  assert.match(doc, /AUTHORIZATION_ERROR/);
  assert.match(doc, /OWNERSHIP_ERROR/);
  assert.match(doc, /DUPLICATE_ERROR/);
  assert.match(doc, /RELATIONSHIP_ERROR/);
  assert.match(doc, /LIFECYCLE_ERROR/);
  assert.match(doc, /TRUST_ERROR/);
  assert.match(doc, /SYSTEM_ERROR/);
  assert.match(doc, /Duplicate users/);
  assert.match(doc, /Duplicate emails/);
  assert.match(doc, /Duplicate professional profiles/);
  assert.match(doc, /Duplicate businesses/);
  assert.match(doc, /Two doctors with same identity/);
  assert.match(doc, /Doctor registered twice/);
  assert.match(doc, /Restaurant duplicate/);
  assert.match(doc, /Factory duplicate/);
});

test('auto specification, IQ audit, kill-critical review, error UX, and boundaries exist', async () => {
  const doc = await read('docs/contracts/MODULE-API-ROUTE-ERROR-DIAGNOSIS-AUDIT-CONTRACT.md');

  assert.match(doc, /Auto Specification Rules/);
  assert.match(doc, /entity definition/);
  assert.match(doc, /fields/);
  assert.match(doc, /validations/);
  assert.match(doc, /permissions/);
  assert.match(doc, /audit events/);
  assert.match(doc, /IQ Architecture Review/);
  assert.match(doc, /Missing Entities/);
  assert.match(doc, /KILL CRITICAL Review/);
  assert.match(doc, /Marketplace drift/);
  assert.match(doc, /Payment drift/);
  assert.match(doc, /Data privacy risks/);
  assert.match(doc, /تعذر إنشاء الملف/);
  assert.match(doc, /يوجد نشاط مشابه مسجل مسبقاً/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /APIs/);
  assert.match(doc, /Backend routes/);
  assert.match(doc, /Database models/);
  assert.match(doc, /Authentication/);
  assert.match(doc, /Authorization middleware/);
  assert.match(doc, /Automation systems/);
});

test('RTL Arabic direction remains preserved for module API contract readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
