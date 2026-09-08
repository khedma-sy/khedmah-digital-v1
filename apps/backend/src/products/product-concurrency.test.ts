import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { MediaService } from '../media/media.service';
import { LocalStorageAdapter } from '../media/storage.adapter';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';

// Uses the same guarded, disposable PostgreSQL database as the existing CI suite.
// No skip when PostgreSQL is unavailable: CI is the required database gate.
test('product revision and image mutations are atomic on PostgreSQL', async (t) => {
  const rawPool = createTestPool();
  const db = DatabasePool.fromPool(rawPool);
  try {
    await resetCanonicalTestSchema(rawPool);
    await db.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions/024_product_store.sql'), 'utf8'));
    await db.query(`INSERT INTO core_user_accounts (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
      VALUES ('product_owner','identity_product_owner','individual_user','active','active','private')`);
    const [category] = await db.query<{ code: string }>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    assert.ok(category);
    await db.query(`INSERT INTO business_profiles (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
      VALUES ('product_business','بائع اختبار','product_owner','public','approved','approved','active',$1,'damascus','SY')`, [category.code]);
    const repository = new ProductRepository(db);
    const businesses = new BusinessProfileRepository(db);
    let actor = 'product_owner';
    const identity = { getCurrentUser: async () => ({ id: actor, email: 'fixture@example.test' }) } as any;
    const media = new MediaService(db, identity);
    const storage = new LocalStorageAdapter();
    Object.defineProperty(media, 'storage', { value: storage });
    const service = new ProductService(repository, businesses, { assertActiveCategory: async () => {} } as any, identity, { assert() {} } as any);
    const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const upload = () => media.upload(undefined, { ownerType: 'product_listing', ownerId: 'product_fixture', filename: 'fixture.png', mimeType: 'image/png',
      sizeBytes: png.length, content: png.toString('base64'), visibility: 'public', assetType: 'product_image', sortOrder: 0 });
    async function reset(imageCount = 1) {
      actor = 'product_owner';
      await db.query(`DELETE FROM media_assets WHERE owner_type='product_listing'; DELETE FROM product_listings`);
      await db.query(`INSERT INTO product_listings (id,business_profile_id,owner_user_id,title_ar,price,currency,category_code,availability,status,moderation_status)
        VALUES ('product_fixture','product_business','product_owner','منتج اختبار',100,'SYP',$1,'in_stock','draft','pending')`, [category.code]);
      for (let i = 0; i < imageCount; i++) await upload();
      return (await repository.findById('product_fixture'))!;
    }
    async function pending() { await reset(); return service.submit(undefined, 'product_fixture'); }

    await t.test('revision preserves microseconds and increases even when the wall clock is behind', async () => {
      await reset();
      await db.query(`UPDATE product_listings SET updated_at='2999-01-01T00:00:00.123456Z' WHERE id='product_fixture'`);
      const before = (await repository.findById('product_fixture'))!;
      const after = await repository.update({ ...before, titleAr: 'تعديل آمن' }, before.revision);
      assert.equal(before.revision, '2999-01-01T00:00:00.123456Z');
      assert.equal(after.revision, '2999-01-01T00:00:00.123457Z');
      assert.equal(after.updatedAt, before.updatedAt, 'Date millisecond equality must not allow a stale revision');
      await assert.rejects(() => repository.update(before, before.revision), ConflictException);
    });
    await t.test('two writes using the same revision have exactly one winner', async () => {
      const before = await reset();
      const outcomes = await Promise.allSettled(['أول تعديل', 'ثاني تعديل'].map(titleAr => repository.update({ ...before, titleAr }, before.revision)));
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(o => o.status === 'rejected' && o.reason instanceof ConflictException).length, 1);
      const winner = outcomes.find(o => o.status === 'fulfilled'); assert.ok(winner?.status === 'fulfilled');
      assert.equal((await repository.findById(before.id))!.titleAr, winner.value.titleAr);
    });
    await t.test('reviewing an older queued item cannot publish a resubmitted edit', async () => {
      const before = await pending();
      await service.update(undefined, before.id, { titleAr: 'المحتوى الجديد' }); await service.submit(undefined, before.id);
      await assert.rejects(() => service.review(undefined, before.id, 'approved', undefined, before.revision), ConflictException);
      const current = (await repository.findById(before.id))!; assert.equal(current.titleAr, 'المحتوى الجديد'); assert.equal(current.moderationStatus, 'pending');
    });
    await t.test('current approval succeeds but its revision cannot be reused', async () => {
      const before = await pending(); const approved = await service.review(undefined, before.id, 'approved', undefined, before.revision);
      assert.ok(await repository.findPublicById(before.id)); assert.notEqual(approved.revision, before.revision);
      await assert.rejects(() => service.review(undefined, before.id, 'approved', undefined, before.revision), ConflictException);
    });
    await t.test('adding an image unpublishes the approved listing and invalidates its review', async () => {
      const before = await pending(); const approved = await service.review(undefined, before.id, 'approved', undefined, before.revision);
      await upload(); const current = (await repository.findById(before.id))!;
      assert.equal(current.status, 'draft'); assert.equal(current.moderationStatus, 'pending'); assert.equal(current.imageUrls!.length, 2);
      assert.notEqual(current.revision, approved.revision); assert.equal(await repository.findPublicById(before.id), undefined);
    });
    await t.test('deleting an image atomically unpublishes and blocks approval of the old version', async () => {
      const before = await pending(); await service.review(undefined, before.id, 'approved', undefined, before.revision);
      const [asset] = await media.listForOwner(undefined, 'product_listing', before.id); await media.delete(undefined, asset.id);
      const current = (await repository.findById(before.id))!; assert.equal(current.status, 'draft'); assert.equal(current.imageUrls!.length, 0);
      assert.equal(await repository.findPublicById(before.id), undefined);
      await assert.rejects(() => service.submit(undefined, before.id), BadRequestException);
      await assert.rejects(() => media.readPublic(asset.id), NotFoundException);
    });
    await t.test('image mutation while a reviewer is validating the seller rejects the stale write', async () => {
      const before = await pending(); let entered!: () => void; let release!: () => void;
      const arrived = new Promise<void>(resolve => { entered = resolve; });
      const sellerGate = { findById: async (id: string) => { entered(); await new Promise<void>(resolve => { release = resolve; }); return businesses.findById(id); } } as any;
      const delayed = new ProductService(repository, sellerGate, {} as any, identity, { assert() {} } as any);
      const review = delayed.review(undefined, before.id, 'approved', undefined, before.revision); await arrived; await upload(); release();
      await assert.rejects(() => review, ConflictException); assert.equal((await repository.findById(before.id))!.status, 'draft');
    });
    await t.test('two concurrent uploads cannot exceed the fifth image slot', async () => {
      await reset(4); const outcomes = await Promise.allSettled([upload(), upload()]);
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(o => o.status === 'rejected' && o.reason instanceof BadRequestException).length, 1);
      assert.equal((await repository.findById('product_fixture'))!.imageUrls!.length, 5);
    });
    await t.test('another account cannot mutate product images or product content', async () => {
      const before = await reset(); const [asset] = await media.listForOwner(undefined, 'product_listing', before.id); actor = 'another_owner';
      await assert.rejects(upload, ForbiddenException); await assert.rejects(() => media.delete(undefined, asset.id), ForbiddenException);
      await assert.rejects(() => service.update(undefined, before.id, { titleAr: 'محاولة تعديل' }), ForbiddenException);
      assert.equal((await repository.findById(before.id))!.revision, before.revision);
    });
    await t.test('a storage delete failure cannot leave a published image reference', async () => {
      const before = await pending(); await service.review(undefined, before.id, 'approved', undefined, before.revision);
      const [asset] = await media.listForOwner(undefined, 'product_listing', before.id);
      Object.defineProperty(media, 'storage', { value: { ...storage, delete: async () => { throw new Error('offline fixture'); } } });
      try { await media.delete(undefined, asset.id); } finally { Object.defineProperty(media, 'storage', { value: storage }); }
      assert.equal(await repository.findPublicById(before.id), undefined); await assert.rejects(() => media.readPublic(asset.id), NotFoundException);
    });
  } finally { await db.end(); }
});
