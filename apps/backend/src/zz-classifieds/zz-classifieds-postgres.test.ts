import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ConflictException, HttpException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { AdRepository } from '../classifieds/ad.repository';
import { AdService } from '../classifieds/ad.service';

// Lives under a lexically-last nested directory so the backend shell glob includes it
// and migration 024 tests complete before 025 is applied to the shared disposable DB.
test('classifieds migration 025 and runtime contracts hold on PostgreSQL', async (t) => {
  const rawPool = createTestPool();
  const db = DatabasePool.fromPool(rawPool);
  const previousFlag = process.env.CLASSIFIEDS_ENABLED;
  process.env.CLASSIFIEDS_ENABLED = 'true';
  try {
    await resetCanonicalTestSchema(rawPool);
    const productExists = await db.query<{ exists: boolean }>(`SELECT to_regclass('public.product_listings') IS NOT NULL AS exists`);
    if (!productExists[0]?.exists) {
      await db.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions/024_product_store.sql'), 'utf8'));
    }
    const adsExists = await db.query<{ exists: boolean }>(`SELECT to_regclass('public.ad_listings') IS NOT NULL AS exists`);
    if (!adsExists[0]?.exists) {
      await db.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions/025_classifieds.sql'), 'utf8'));
    }

    for (const [id, identity] of [
      ['classifieds_owner', 'identity_classifieds_owner'],
      ['classifieds_quota_owner', 'identity_classifieds_quota_owner'],
      ['classifieds_reviewer', 'identity_classifieds_reviewer']
    ] as const) {
      await db.query(`INSERT INTO core_user_accounts
        (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
        VALUES ($1,$2,'individual_user','active','active','private') ON CONFLICT (user_identifier) DO NOTHING`, [id, identity]);
    }
    const [category] = await db.query<{ code: string }>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    assert.ok(category);

    let actor = { id: 'classifieds_owner', email: 'owner@example.test' };
    const identity = { getCurrentUser: async () => actor } as any;
    const service = new AdService(new AdRepository(db), identity, { assert() {} } as any);

    const input = (requestId: string, titleAr: string) => ({
      clientRequestId: requestId,
      kind: 'sale',
      titleAr,
      categoryCode: category.code,
      priceMode: 'none',
      contactMode: 'profile'
    });

    await t.test('create replay is durable and request-key rebinding is rejected', async () => {
      actor = { id: 'classifieds_owner', email: 'owner@example.test' };
      const body = input('classifieds-pg-create-0001', 'إعلان تجريبي مستقل');
      const first = await service.create(undefined, body);
      const replay = await service.create(undefined, body);
      assert.equal(replay.id, first.id);
      const [count] = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ad_listings WHERE id=$1`, [first.id]);
      assert.equal(count.count, 1);
      await assert.rejects(() => service.create(undefined, { ...body, titleAr: 'محتوى مختلف' }), ConflictException);
    });

    await t.test('content revision prevents stale owner writes', async () => {
      actor = { id: 'classifieds_owner', email: 'owner@example.test' };
      const ad = await service.create(undefined, input('classifieds-pg-create-0002', 'إعلان للمراجعة الذرية'));
      const updated = await service.update(undefined, ad.id, {
        clientRequestId: 'classifieds-pg-update-0001', expectedContentRevision: ad.contentRevision, titleAr: 'تعديل أول'
      });
      assert.equal(updated.contentRevision, ad.contentRevision + 1);
      await assert.rejects(() => service.update(undefined, ad.id, {
        clientRequestId: 'classifieds-pg-update-0002', expectedContentRevision: ad.contentRevision, titleAr: 'تعديل قديم'
      }), ConflictException);
    });

    await t.test('review revision, append-only audit and public projection are enforced', async () => {
      actor = { id: 'classifieds_owner', email: 'owner@example.test' };
      const ad = await service.create(undefined, input('classifieds-pg-create-0003', 'إعلان للنشر العام'));
      const pending = await service.submit(undefined, ad.id, { clientRequestId: 'classifieds-pg-submit-0001' });
      assert.equal(pending.status, 'pending_review');
      actor = { id: 'classifieds_reviewer', email: 'reviewer@example.test' };
      const approved = await service.moderate(undefined, ad.id, {
        expectedReviewRevision: pending.reviewRevision, decision: 'approved'
      });
      assert.equal(approved.status, 'active');
      const [event] = await db.query<{ id: string; content_revision: string | number }>(
        `SELECT id,content_revision FROM ad_moderation_events WHERE ad_id=$1`, [ad.id]);
      assert.ok(event);
      assert.equal(Number(event.content_revision), pending.contentRevision);
      await assert.rejects(() => db.query(`DELETE FROM ad_moderation_events WHERE id=$1`, [event.id]));
      const publicAd = await service.getPublic(ad.id);
      assert.equal(publicAd.id, ad.id);
      assert.equal('ownerUserId' in publicAd, false);
      assert.equal('reviewRevision' in publicAd, false);
      await assert.rejects(() => service.moderate(undefined, ad.id, {
        expectedReviewRevision: pending.reviewRevision, decision: 'approved'
      }), ConflictException);
    });

    await t.test('three-slot quota is serialized under concurrent submission', async () => {
      actor = { id: 'classifieds_quota_owner', email: 'quota@example.test' };
      const ads = [];
      for (let index = 0; index < 4; index += 1) {
        ads.push(await service.create(undefined, input(`classifieds-pg-quota-create-${index}000`, `إعلان الحصة ${index}`)));
      }
      await service.submit(undefined, ads[0].id, { clientRequestId: 'classifieds-pg-quota-submit-0000' });
      await service.submit(undefined, ads[1].id, { clientRequestId: 'classifieds-pg-quota-submit-0001' });
      const outcomes = await Promise.allSettled([
        service.submit(undefined, ads[2].id, { clientRequestId: 'classifieds-pg-quota-submit-0002' }),
        service.submit(undefined, ads[3].id, { clientRequestId: 'classifieds-pg-quota-submit-0003' })
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      assert.ok(rejected?.status === 'rejected');
      assert.ok(rejected.reason instanceof HttpException);
      assert.equal(rejected.reason.getStatus(), 429);
      const quota = await service.quota(undefined);
      assert.deepEqual(quota, { used: 3, limit: 3 });
      const [count] = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ad_free_slots WHERE owner_user_id='classifieds_quota_owner'`);
      assert.equal(count.count, 3);
    });
  } finally {
    if (previousFlag === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previousFlag;
    await db.end();
  }
});
