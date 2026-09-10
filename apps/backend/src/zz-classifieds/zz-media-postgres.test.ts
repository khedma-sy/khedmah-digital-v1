import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdMediaService } from '../classifieds/ad-media.service';
import { AdRepository } from '../classifieds/ad.repository';
import { AdService } from '../classifieds/ad.service';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { LocalStorageAdapter } from '../media/storage.adapter';

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

test('classifieds media is revision-bound and review-safe on PostgreSQL', async (t) => {
  const rawPool = createTestPool();
  const db = DatabasePool.fromPool(rawPool);
  const previousFlag = process.env.CLASSIFIEDS_ENABLED;
  process.env.CLASSIFIEDS_ENABLED = 'true';
  try {
    await resetCanonicalTestSchema(rawPool);
    const [productState] = await db.query<{ exists: boolean }>(`SELECT to_regclass('public.product_listings') IS NOT NULL AS exists`);
    if (!productState?.exists) await db.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions/024_product_store.sql'), 'utf8'));
    const [adState] = await db.query<{ exists: boolean }>(`SELECT to_regclass('public.ad_listings') IS NOT NULL AS exists`);
    if (!adState?.exists) await db.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions/025_classifieds.sql'), 'utf8'));

    for (const [id, identityReference] of [
      ['classifieds_media_owner', 'identity_classifieds_media_owner'],
      ['classifieds_media_other', 'identity_classifieds_media_other'],
      ['classifieds_media_reviewer', 'identity_classifieds_media_reviewer']
    ] as const) {
      await db.query(`INSERT INTO core_user_accounts
        (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
        VALUES ($1,$2,'individual_user','active','active','private') ON CONFLICT(user_identifier) DO NOTHING`, [id, identityReference]);
    }
    const [category] = await db.query<{ code: string }>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    assert.ok(category);

    let actor = { id: 'classifieds_media_owner', email: 'owner@example.test' };
    const identity = { getCurrentUser: async () => actor } as any;
    const rbac = { assert(email: string) { if (email !== 'reviewer@example.test') throw new Error('denied'); } } as any;
    const repository = new AdRepository(db);
    const ads = new AdService(repository, identity, rbac);
    const media = new AdMediaService(db, identity, rbac);
    const storage = new LocalStorageAdapter();
    Object.defineProperty(media, 'storage', { value: storage });

    const createAd = async (requestId: string, titleAr: string) => {
      actor = { id: 'classifieds_media_owner', email: 'owner@example.test' };
      return ads.create(undefined, {
        clientRequestId: requestId, kind: 'sale', titleAr, categoryCode: category.code,
        priceMode: 'none', contactMode: 'profile'
      });
    };
    const uploadBody = (requestId: string, expectedContentRevision: number, filename = 'ad.png', sortOrder = 0) => ({
      clientRequestId: requestId, expectedContentRevision, filename, mimeType: 'image/png',
      sizeBytes: png.length, content: png.toString('base64'), sortOrder
    });

    await t.test('upload replay is stable and a request key cannot be rebound', async () => {
      const ad = await createAd('classifieds-media-ad-create-0001', 'إعلان مع صورة');
      const body = uploadBody('classifieds-media-upload-0001', ad.contentRevision);
      const first = await media.upload(undefined, ad.id, body);
      const replay = await media.upload(undefined, ad.id, body);
      assert.equal(replay.image.id, first.image.id);
      assert.equal(replay.contentRevision, first.contentRevision);
      const [count] = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM media_assets WHERE owner_type='ad_listing' AND owner_id=$1`, [ad.id]);
      assert.equal(count.count, 1);
      await assert.rejects(() => media.upload(undefined, ad.id, { ...body, filename: 'different.png' }), ConflictException);
    });

    await t.test('another account cannot inspect or mutate owner media', async () => {
      const ad = await createAd('classifieds-media-ad-create-0002', 'إعلان ملكية الصور');
      const uploaded = await media.upload(undefined, ad.id, uploadBody('classifieds-media-upload-0002', ad.contentRevision));
      actor = { id: 'classifieds_media_other', email: 'other@example.test' };
      await assert.rejects(() => media.listMine(undefined, ad.id), NotFoundException);
      await assert.rejects(() => media.readMine(undefined, ad.id, uploaded.image.id), NotFoundException);
      await assert.rejects(() => media.upload(undefined, ad.id, uploadBody('classifieds-media-upload-0003', uploaded.contentRevision)), NotFoundException);
    });

    await t.test('reviewer can inspect pending media while public cannot until approval', async () => {
      const ad = await createAd('classifieds-media-ad-create-0003', 'إعلان مراجعة الصور');
      const uploaded = await media.upload(undefined, ad.id, uploadBody('classifieds-media-upload-0004', ad.contentRevision));
      const pending = await ads.submit(undefined, ad.id, { clientRequestId: 'classifieds-media-submit-0001' });
      await assert.rejects(() => media.readPublic(uploaded.image.id), NotFoundException);
      await assert.rejects(() => media.upload(undefined, ad.id, uploadBody('classifieds-media-upload-0005', uploaded.contentRevision)), ConflictException);
      actor = { id: 'classifieds_media_reviewer', email: 'reviewer@example.test' };
      const reviewed = await media.readForReview(undefined, uploaded.image.id);
      assert.deepEqual(reviewed.data, png);
      const approved = await ads.moderate(undefined, ad.id, { expectedReviewRevision: pending.reviewRevision, decision: 'approved' });
      assert.equal(approved.status, 'active');
      assert.deepEqual((await media.readPublic(uploaded.image.id)).data, png);
      actor = { id: 'classifieds_media_owner', email: 'owner@example.test' };
      await assert.rejects(() => media.remove(undefined, ad.id, uploaded.image.id, {
        clientRequestId: 'classifieds-media-delete-locked-0001', expectedContentRevision: approved.contentRevision
      }), ConflictException);
    });

    await t.test('media edit after rejection returns the ad to draft and invalidates the reviewed content', async () => {
      const ad = await createAd('classifieds-media-ad-create-0004', 'إعلان مرفوض للتعديل');
      const firstImage = await media.upload(undefined, ad.id, uploadBody('classifieds-media-upload-0006', ad.contentRevision));
      const pending = await ads.submit(undefined, ad.id, { clientRequestId: 'classifieds-media-submit-0002' });
      actor = { id: 'classifieds_media_reviewer', email: 'reviewer@example.test' };
      const rejected = await ads.moderate(undefined, ad.id, {
        expectedReviewRevision: pending.reviewRevision, decision: 'rejected', reason: 'الصورة تحتاج تحديثًا'
      });
      actor = { id: 'classifieds_media_owner', email: 'owner@example.test' };
      const changed = await media.upload(undefined, ad.id, uploadBody('classifieds-media-upload-0007', rejected.contentRevision, 'replacement.png', 1));
      assert.equal(changed.contentRevision, rejected.contentRevision + 1);
      const current = await ads.getMine(undefined, ad.id);
      assert.equal(current.status, 'draft');
      assert.equal(current.rejectionReason, undefined);
      assert.equal(current.imageUrls.length, 2);
      const resubmitted = await ads.submit(undefined, ad.id, { clientRequestId: 'classifieds-media-submit-0003' });
      assert.ok(resubmitted.reviewRevision > pending.reviewRevision);
      actor = { id: 'classifieds_media_reviewer', email: 'reviewer@example.test' };
      await assert.rejects(() => ads.moderate(undefined, ad.id, {
        expectedReviewRevision: pending.reviewRevision, decision: 'approved'
      }), ConflictException);
      assert.ok(firstImage.image.id);
    });

    await t.test('delete replay does not bump content twice and no arbitrary image-count limit is introduced', async () => {
      const ad = await createAd('classifieds-media-ad-create-0005', 'إعلان صور متعددة');
      let revision = ad.contentRevision;
      const images = [];
      for (let index = 0; index < 6; index += 1) {
        const uploaded = await media.upload(undefined, ad.id, uploadBody(`classifieds-media-many-upload-${index}00`, revision, `image-${index}.png`, index));
        revision = uploaded.contentRevision;
        images.push(uploaded.image);
      }
      assert.equal((await media.listMine(undefined, ad.id)).length, 6);
      const body = { clientRequestId: 'classifieds-media-delete-0001', expectedContentRevision: revision };
      const removed = await media.remove(undefined, ad.id, images[0].id, body);
      const replay = await media.remove(undefined, ad.id, images[0].id, body);
      assert.equal(replay.contentRevision, removed.contentRevision);
      assert.equal((await media.listMine(undefined, ad.id)).length, 5);
      const [count] = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM media_assets WHERE owner_type='ad_listing' AND owner_id=$1`, [ad.id]);
      assert.equal(count.count, 5);
    });
  } finally {
    if (previousFlag === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previousFlag;
    await db.end();
  }
});
