import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [app, controller, service, client, admin, adminHome, signup, migration] = await Promise.all([
  read('apps/backend/src/app.ts'),
  read('apps/backend/src/taxi/taxi-operational-approval.controller.ts'),
  read('apps/backend/src/taxi/taxi-operational-approval.service.ts'),
  read('apps/frontend/lib/taxi-operational-review-client.ts'),
  read('apps/frontend/app/admin/taxi-drivers/page.tsx'),
  read('apps/frontend/app/admin/page.tsx'),
  read('apps/frontend/app/taxi-driver-signup/page.tsx'),
  read('backend/migrations/versions/031_taxi_operational_approvals.sql')
]);

test('Taxi operational API uses the single global api/v1 prefix and an administrative rate limit', () => {
  assert.match(app, /setGlobalPrefix\('api\/v1'\)/);
  assert.match(controller, /@Controller\('taxi-operational-approvals'\)/);
  assert.doesNotMatch(controller, /@Controller\('api\/v1\/taxi-operational-approvals'\)/);
  assert.match(app, /'\/api\/v1\/taxi-operational-approvals'/);
  assert.match(app, /'taxi\.operational-admin', authWindowMs, authMax/);
  assert.match(client, /\/api\/v1\$\{path\}/);
  assert.match(client, /'\/taxi-operational-approvals\/candidates'/);
});

test('Taxi operational writer requires reviewer authority, four latest approvals and a ready business profile', () => {
  assert.match(service, /this\.rbac\.assert\(actor\.email, 'security\.manage'\)/);
  assert.match(service, /business\.owner_user_id === actor\.id/);
  assert.match(service, /REQUIRED_DOCUMENTS\.some\(\(type\) => byType\.get\(type\) !== 'approved'\)/);
  assert.match(service, /visibility === 'public'/);
  assert.match(service, /moderation_status === 'approved'/);
  assert.match(service, /trust_status === 'approved'/);
  assert.match(service, /business\.status === 'active'/);
  assert.match(service, /DISTINCT ON \(r\.document_type\)/);
  assert.match(service, /ORDER BY r\.document_type,m\.created_at DESC,m\.id DESC/);
});

test('Taxi operational authority remains distinct from trip execution', () => {
  assert.match(migration, /does NOT create trip\/dispatch tables/);
  assert.match(admin, /الاعتماد التشغيلي لا يفعّل رحلات التكسي تلقائيًا/);
  assert.match(admin, /استقبال الرحلات والـdispatch يظلان خلف بوابة تشغيل مستقلة/);
  assert.match(signup, /هذه الصفحة لا تمنح نفسها صلاحية القيادة ولا تفتح Trip engine/);
  assert.doesNotMatch(admin, /TAXI_TRIPS_ENABLED\s*=\s*true|تم تفعيل الرحلات/);
  assert.doesNotMatch(signup, /تم تفعيل الرحلات/);
});

test('Taxi Ops reviews the latest private documents before operational approval without browser prompts', () => {
  assert.match(admin, /latestDocuments/);
  assert.match(admin, /sort\(\(a, b\) => b\.createdAt\.localeCompare\(a\.createdAt\)\)/);
  assert.match(admin, /document\.secureUrl/);
  assert.match(admin, /reviewDocument/);
  assert.match(admin, /profileReady && candidate\.documentsApproved/);
  assert.match(admin, /role="dialog"/);
  assert.doesNotMatch(admin, /window\.prompt|window\.confirm/);
});

test('Taxi admin entry is permission-gated and exposes the governed driver console', () => {
  assert.match(adminHome, /const canManageModeration = overview\.permissions\.includes\('security\.manage'\)/);
  assert.match(adminHome, /canManageModeration \? <Link href="\/admin\/taxi-drivers">سائقو التكسي<\/Link>/);
  assert.match(adminHome, /Taxi Driver Ops/);
  assert.match(adminHome, /فتح إدارة سائقي التكسي/);
});

test('driver onboarding shows the complete six-stage Khedmah approval journey', () => {
  for (const label of [
    'إنشاء ملف تكسي',
    'رفع الوثائق الأربع',
    'مراجعة المستندات',
    'مراجعة النشاط والثقة',
    'اعتماد السائق والسيارة والمنطقة',
    'الأهلية للربط بالعملاء'
  ]) assert.match(signup, new RegExp(label));
  assert.match(signup, /taxiOperationalReviewApi\.status/);
  assert.match(signup, /operationalStatus === 'approved'/);
  assert.match(signup, /استقبال الرحلات يظهر فقط عند تفعيل خدمة الرحلات التشغيلية/);
});
