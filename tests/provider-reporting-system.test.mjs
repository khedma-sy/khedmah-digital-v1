import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('provider reports are persisted with governed targets, states, and duplicate protection', async () => {
  const migration = await read('backend/migrations/versions/021_provider_reports.sql');

  assert.match(migration, /CREATE TABLE provider_reports/);
  assert.match(migration, /REFERENCES core_user_accounts/);
  assert.match(migration, /target_type IN \('business', 'professional'\)/);
  assert.match(migration, /status IN \('submitted', 'in_review', 'resolved', 'dismissed'\)/);
  assert.match(migration, /provider_reports_exactly_one_target_check/);
  assert.match(migration, /CREATE UNIQUE INDEX provider_reports_open_reporter_target_idx/);
  assert.match(migration, /reviewed_by_user_identifier/);
  assert.match(migration, /resolution_note/);
});

test('report submission is authenticated, validates public targets, and returns a safe receipt', async () => {
  const service = await read('apps/backend/src/reports/report.service.ts');
  const repository = await read('apps/backend/src/reports/report.repository.ts');
  const controller = await read('apps/backend/src/reports/report.controller.ts');

  assert.match(service, /identity\.getCurrentUser/);
  assert.match(service, /isPublicTarget/);
  assert.match(service, /provider\.report\.submitted/);
  assert.match(repository, /moderation_status='approved'/);
  assert.match(repository, /visibility='public'/);
  assert.match(service, /code\?: string.*23505/s);
  assert.match(controller, /businesses\/:businessProfileId\/reports/);
  assert.match(controller, /professionals\/:professionalProfileId\/reports/);
  assert.match(controller, /admin\/reports/);
  assert.match(service, /security\.manage/);
  assert.match(service, /provider\.report\.reviewed/);
  assert.doesNotMatch(service, /localStorage|sessionStorage/);
});

test('both public profile types use the same real report flow', async () => {
  const business = await read('apps/frontend/app/business-profiles/[id]/page.tsx');
  const professional = await read('apps/frontend/app/professional-profiles/[id]/page.tsx');
  const form = await read('apps/frontend/components/provider-report-form.tsx');
  const api = await read('apps/frontend/lib/api-client.ts');

  assert.match(business, /ProviderReportForm/);
  assert.match(professional, /ProviderReportForm/);
  assert.match(form, /api\.reports\.submit/);
  assert.match(form, /القرار النهائي للمراجعة البشرية/);
  assert.match(api, /method: 'POST'/);
  assert.ok(api.includes('`/${collection}/${target.id}/reports`'));
  assert.doesNotMatch(form, /localStorage|sessionStorage|Math\.random/);
});

test('human moderation queue can review, resolve, or dismiss persisted reports', async () => {
  const repository = await read('apps/backend/src/reports/report.repository.ts');
  const admin = await read('apps/frontend/app/admin/moderation/page.tsx');
  assert.match(repository, /status IN \('submitted','in_review'\)/);
  assert.match(repository, /reviewed_by_user_identifier/);
  assert.match(admin, /بلاغات المستخدمين/);
  assert.match(admin, /بدء المراجعة/);
  assert.match(admin, /تمت المعالجة/);
  assert.match(admin, /استبعاد/);
});
