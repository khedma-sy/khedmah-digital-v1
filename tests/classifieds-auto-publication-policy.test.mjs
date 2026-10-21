import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryPath = new URL('../apps/backend/src/classifieds/ad.repository.ts', import.meta.url);
const servicePath = new URL('../apps/backend/src/classifieds/ad.service.ts', import.meta.url);
const migrationPath = new URL('../backend/migrations/versions/036_classifieds_rolling_publication_quota.sql', import.meta.url);
const newPagePath = new URL('../apps/frontend/app/classifieds/new/page.tsx', import.meta.url);

test('classified submission and reactivation enter human review without consuming publication quota', async () => {
  const source = await readFile(repositoryPath, 'utf8');
  const submit = source.slice(source.indexOf('async submit('), source.indexOf('async deactivate('));
  const reactivate = source.slice(source.indexOf('async reactivate('), source.indexOf('async moderate('));
  for (const transition of [submit, reactivate]) {
    assert.match(transition, /SET status='pending_review'/);
    assert.match(transition, /revision=revision\+1/);
    assert.match(transition, /review_revision=review_revision\+1/);
    assert.doesNotMatch(transition, /SET status='active'/);
    assert.doesNotMatch(transition, /INSERT INTO ad_free_slots/);
    assert.match(transition, /readReplay/);
    assert.match(transition, /recordReceipt/);
  }
  assert.match(submit, /assertBusinessPublishable/);
});

test('only current human approval publishes and atomically consumes or reuses the per-ad quota slot', async () => {
  const source = await readFile(repositoryPath, 'utf8');
  const moderate = source.slice(source.indexOf('async moderate('), source.indexOf('async findMine('));
  assert.match(moderate, /ad\.status !== 'pending_review'/);
  assert.match(moderate, /ad\.reviewRevision !== expectedReviewRevision/);
  assert.match(moderate, /decision === 'approved'[\s\S]*ad\.ownerUserId === reviewerUserId/);
  assert.match(moderate, /AD_EXPIRED_BEFORE_APPROVAL[\s\S]*assertBusinessPublishable/);
  assert.match(moderate, /SELECT ad_id FROM ad_free_slots WHERE ad_id=\$1 AND owner_user_id=\$2/);
  assert.match(moderate, /if \(!existingSlot\.rowCount\)[\s\S]*INSERT INTO ad_free_slots\(ad_id,owner_user_id\)/);
  assert.ok(moderate.indexOf('INSERT INTO ad_free_slots') < moderate.indexOf('UPDATE ad_listings SET status=$2'));
  assert.match(moderate, /decision === 'approved' \? 'active' : 'rejected'/);
});

test('rolling database quota enforces three publications per day and five per week', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  assert.match(migration, /interval '24 hours'[\s\S]*>= 3[\s\S]*AD_DAILY_QUOTA_EXHAUSTED/);
  assert.match(migration, /interval '7 days'[\s\S]*>= 5[\s\S]*AD_WEEKLY_QUOTA_EXHAUSTED/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('quota API and creation UI expose both rolling windows without blocking review submission', async () => {
  const [service, page] = await Promise.all([readFile(servicePath, 'utf8'), readFile(newPagePath, 'utf8')]);
  assert.match(service, /daily: \{ used: number; limit: 3 \}/);
  assert.match(service, /weekly: \{ used: number; limit: 5 \}/);
  assert.match(page, /dailyQuota\.used >= dailyQuota\.limit/);
  assert.match(page, /weeklyQuota\.used >= weeklyQuota\.limit/);
  assert.match(page, /حفظ وإرسال للمراجعة/);
  assert.match(page, /لا يظهر للعامة إلا بعد اعتماده/);
  assert.doesNotMatch(page, /النشر مباشر/);
  assert.doesNotMatch(page, /value="review" disabled=\{[^}]*publicationQuotaFull/);
});
