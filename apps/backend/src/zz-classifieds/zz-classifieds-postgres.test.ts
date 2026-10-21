import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { CLASSIFIEDS_SMART_ADMIN_VERSION } from '../classifieds/ad-moderation-assessment';
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
    await db.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions/036_classifieds_rolling_publication_quota.sql'), 'utf8'));

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
    const service = new AdService(new AdRepository(db), identity, { assert() {}, assertAny() {} } as any);

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

      await assert.rejects(() => service.submit(undefined, ad.id, {
        clientRequestId: 'classifieds-pg-stale-submit-0001', expectedContentRevision: ad.contentRevision
      }), ConflictException);
      assert.deepEqual(await service.quota(undefined), {
        used: 0, limit: 5, daily: { used: 0, limit: 3 }, weekly: { used: 0, limit: 5 }
      });

      const submitBody = {
        clientRequestId: 'classifieds-pg-bound-submit-0001', expectedContentRevision: updated.contentRevision
      };
      const submitted = await service.submit(undefined, ad.id, submitBody);
      const replay = await service.submit(undefined, ad.id, submitBody);
      assert.equal(submitted.status, 'pending_review');
      assert.equal(submitted.revision, replay.revision);
      assert.deepEqual(await service.quota(undefined), {
        used: 0, limit: 5, daily: { used: 0, limit: 3 }, weekly: { used: 0, limit: 5 }
      });
      actor = { id: 'classifieds_reviewer', email: 'reviewer@example.test' };
      const published = await service.moderate(undefined, ad.id, {
        expectedReviewRevision: submitted.reviewRevision,
        expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
        decision: 'approved'
      });
      assert.equal(published.status, 'active');
      actor = { id: 'classifieds_owner', email: 'owner@example.test' };
      assert.deepEqual(await service.quota(undefined), {
        used: 1, limit: 5, daily: { used: 1, limit: 3 }, weekly: { used: 1, limit: 5 }
      });
      await assert.rejects(() => service.submit(undefined, ad.id, {
        ...submitBody, expectedContentRevision: updated.contentRevision + 1
      }), ConflictException);
    });

    await t.test('human approval is required before public projection', async () => {
      actor = { id: 'classifieds_owner', email: 'owner@example.test' };
      const ad = await service.create(undefined, input('classifieds-pg-create-0003', 'إعلان للنشر العام'));
      const submitted = await service.submit(undefined, ad.id, {
        clientRequestId: 'classifieds-pg-submit-0001', expectedContentRevision: ad.contentRevision
      });
      assert.equal(submitted.status, 'pending_review');
      const [moderationCount] = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ad_moderation_events WHERE ad_id=$1`, [ad.id]);
      assert.equal(moderationCount.count, 0);
      await assert.rejects(() => service.getPublic(ad.id), NotFoundException);
      actor = { id: 'classifieds_reviewer', email: 'reviewer@example.test' };
      const published = await service.moderate(undefined, ad.id, {
        expectedReviewRevision: submitted.reviewRevision,
        expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
        decision: 'approved'
      });
      assert.equal(published.status, 'active');
      const [reviewedCount] = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ad_moderation_events WHERE ad_id=$1`, [ad.id]);
      assert.equal(reviewedCount.count, 1);
      const publicAd = await service.getPublic(ad.id);
      assert.equal(publicAd.id, ad.id);
      assert.equal('ownerUserId' in publicAd, false);
      assert.equal('reviewRevision' in publicAd, false);
      await assert.rejects(() => service.moderate(undefined, ad.id, {
        expectedReviewRevision: submitted.reviewRevision,
        expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
        decision: 'approved'
      }), ConflictException);
    });

    await t.test('three-publication daily quota is serialized under concurrent human approval', async () => {
      actor = { id: 'classifieds_quota_owner', email: 'quota@example.test' };
      const ads = [];
      for (let index = 0; index < 4; index += 1) {
        ads.push(await service.create(undefined, input(`classifieds-pg-quota-create-${index}000`, `إعلان الحصة ${index}`)));
      }
      const submitted = [];
      for (let index = 0; index < ads.length; index += 1) {
        submitted.push(await service.submit(undefined, ads[index].id, {
          clientRequestId: `classifieds-pg-quota-submit-${index}000`,
          expectedContentRevision: ads[index].contentRevision
        }));
      }
      assert.deepEqual(await service.quota(undefined), {
        used: 0, limit: 5, daily: { used: 0, limit: 3 }, weekly: { used: 0, limit: 5 }
      });
      actor = { id: 'classifieds_reviewer', email: 'reviewer@example.test' };
      await service.moderate(undefined, ads[0].id, {
        expectedReviewRevision: submitted[0].reviewRevision,
        expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
        decision: 'approved'
      });
      await service.moderate(undefined, ads[1].id, {
        expectedReviewRevision: submitted[1].reviewRevision,
        expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
        decision: 'approved'
      });
      const outcomes = await Promise.allSettled([
        service.moderate(undefined, ads[2].id, {
          expectedReviewRevision: submitted[2].reviewRevision,
          expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
          decision: 'approved'
        }),
        service.moderate(undefined, ads[3].id, {
          expectedReviewRevision: submitted[3].reviewRevision,
          expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
          decision: 'approved'
        })
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      assert.ok(rejected?.status === 'rejected');
      assert.ok(rejected.reason instanceof HttpException);
      assert.equal(rejected.reason.getStatus(), 429);
      actor = { id: 'classifieds_quota_owner', email: 'quota@example.test' };
      const quota = await service.quota(undefined);
      assert.deepEqual(quota, {
        used: 3, limit: 5, daily: { used: 3, limit: 3 }, weekly: { used: 3, limit: 5 }
      });
      const [count] = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ad_free_slots WHERE owner_user_id='classifieds_quota_owner'`);
      assert.equal(count.count, 3);
    });
  } finally {
    if (previousFlag === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previousFlag;
    await db.end();
  }
});
