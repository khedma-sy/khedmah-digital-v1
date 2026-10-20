import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryPath = new URL('../apps/backend/src/classifieds/ad.repository.ts', import.meta.url);
const servicePath = new URL('../apps/backend/src/classifieds/ad.service.ts', import.meta.url);
const migrationPath = new URL('../backend/migrations/versions/036_classifieds_rolling_publication_quota.sql', import.meta.url);
const newPagePath = new URL('../apps/frontend/app/classifieds/new/page.tsx', import.meta.url);

test('classified submissions publish directly and preserve the per-ad receipt boundary', async () => {
  const source = await readFile(repositoryPath, 'utf8');
  const submit = source.slice(source.indexOf('async submit('), source.indexOf('async deactivate('));
  assert.match(submit, /INSERT INTO ad_free_slots\(ad_id,owner_user_id\)/);
  assert.match(submit, /SET status='active'/);
  assert.doesNotMatch(submit, /SET status='pending_review'/);
  assert.match(submit, /assertBusinessPublishable/);
});

test('rolling database quota enforces three publications per day and five per week', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  assert.match(migration, /interval '24 hours'[\s\S]*>= 3[\s\S]*AD_DAILY_QUOTA_EXHAUSTED/);
  assert.match(migration, /interval '7 days'[\s\S]*>= 5[\s\S]*AD_WEEKLY_QUOTA_EXHAUSTED/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('quota API and creation UI expose both rolling windows', async () => {
  const [service, page] = await Promise.all([readFile(servicePath, 'utf8'), readFile(newPagePath, 'utf8')]);
  assert.match(service, /daily: \{ used: number; limit: 3 \}/);
  assert.match(service, /weekly: \{ used: number; limit: 5 \}/);
  assert.match(page, /daily\.used >= daily\.limit/);
  assert.match(page, /weekly\.used >= weekly\.limit/);
  assert.match(page, /حفظ ونشر الإعلان/);
});
