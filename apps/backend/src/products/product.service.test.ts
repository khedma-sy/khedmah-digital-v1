import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ProductService } from './product.service';
import type { ProductListing } from './product.types';

const revision = '2026-09-08T01:00:00.123456Z';
const nextRevision = '2026-09-08T01:00:00.123457Z';
const base = { id: 'p', businessProfileId: 'b', ownerUserId: 'owner', titleAr: 'منتج أصلي', price: 100, currency: 'SYP',
  categoryCode: 'general', availability: 'in_stock', status: 'active', moderationStatus: 'pending',
  createdAt: revision, updatedAt: revision, revision, contentRevision: 'a'.repeat(64) } as ProductListing & { revision: string };
function fixture() {
  let product = { ...base }; let actor = 'owner'; let image = true; let authorized = true;
  let businessRead = async () => ({ ownerUserId: 'owner', visibility: 'public', moderationStatus: 'approved', trustStatus: 'approved', status: 'active' });
  const writes: unknown[] = [];
  const repository = {
    findById: async () => ({ ...product }), hasPublicImage: async () => image,
    update: async (next: typeof product, expected?: string) => {
      writes.push({ next, expected });
      if (expected !== undefined && expected !== product.revision) throw new ConflictException('changed');
      product = { ...next, revision: nextRevision }; return { ...product };
    }
  };
  const service = new ProductService(repository as any, { findById: () => businessRead() } as any,
    { assertActiveCategory: async () => {} } as any, { getCurrentUser: async () => ({ id: actor, email: actor }) } as any,
    { assert() { if (!authorized) throw new ForbiddenException(); } } as any);
  return { service, writes, get product() { return product; }, set product(value) { product = value; },
    set actor(value: string) { actor = value; }, set image(value: boolean) { image = value; }, set authorized(value: boolean) { authorized = value; },
    set businessRead(value: typeof businessRead) { businessRead = value; } };
}
// Extra argument reproduces a client-supplied version even before the API is upgraded.
const review = (f: ReturnType<typeof fixture>, expected: unknown = revision, status = 'approved', reason?: string) =>
  (f.service.review as (...args: any[]) => Promise<unknown>)(undefined, 'p', status, reason, expected);
test('review requires the exact revision displayed to the reviewer', async () => {
  const f = fixture(); f.product = { ...f.product, revision: nextRevision, titleAr: 'تعديل أحدث' };
  await assert.rejects(() => review(f), ConflictException); assert.equal(f.writes.length, 0);
});
test('missing or malformed review revision fails before a write', async () => {
  for (const value of [null, '', 'yesterday', {}, '2026-01-01']) { const f = fixture(); await assert.rejects(() => review(f, value), BadRequestException); assert.equal(f.writes.length, 0); }
});
test('concurrent edit cannot be overwritten by a review awaiting seller validation', async () => {
  const f = fixture(); let release!: () => void; let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  f.businessRead = async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return { ownerUserId: 'owner', visibility: 'public', moderationStatus: 'approved', trustStatus: 'approved', status: 'active' }; };
  const pending = review(f); await waiting;
  f.product = { ...f.product, revision: nextRevision, titleAr: 'محفوظ حديثاً', status: 'draft' };
  release(); await assert.rejects(() => pending, ConflictException); assert.equal(f.product.titleAr, 'محفوظ حديثاً'); assert.equal(f.product.status, 'draft');
});
test('current review succeeds and rejection requires a meaningful reason', async () => {
  const f = fixture(); const result = await review(f) as ProductListing; assert.equal(result.moderationStatus, 'approved');
  const rejected = fixture(); await assert.rejects(() => review(rejected, revision, 'rejected', 'no'), BadRequestException);
  await review(rejected, revision, 'rejected', 'صورة غير مناسبة'); assert.equal(rejected.product.rejectionReason, 'صورة غير مناسبة');
});
test('cross-owner edits and unauthorized reviews are denied', async () => {
  const f = fixture(); f.actor = 'other'; await assert.rejects(() => f.service.update(undefined, 'p', { titleAr: 'محاولة تعديل' }), ForbiddenException);
  f.authorized = false; await assert.rejects(() => review(f), ForbiddenException); assert.equal(f.writes.length, 0);
});
test('missing images cannot be submitted or approved', async () => {
  const f = fixture(); f.image = false; await assert.rejects(() => f.service.submit(undefined, 'p'), BadRequestException); await assert.rejects(() => review(f), BadRequestException);
});

test('an owner cannot save a stale content draft over another tab', async () => {
  const f = fixture(); f.product = { ...f.product, contentRevision: 'b'.repeat(64), titleAr: 'تعديل تبويب آخر' };
  await assert.rejects(() => f.service.update(undefined, 'p', { titleAr: 'مسودة قديمة', expectedContentRevision: 'a'.repeat(64) }), ConflictException);
  assert.equal(f.product.titleAr, 'تعديل تبويب آخر'); assert.equal(f.writes.length, 0);
});
test('owner writes require the content reference but tolerate their own image-only changes', async () => {
  const f = fixture(); await assert.rejects(() => f.service.update(undefined, 'p', { titleAr: 'مسودة' }), BadRequestException);
  f.product = { ...f.product, revision: nextRevision };
  await f.service.update(undefined, 'p', { titleAr: 'تعديل بعد الصورة', expectedContentRevision: 'a'.repeat(64) });
  assert.equal(f.product.titleAr, 'تعديل بعد الصورة');
});
test('an explicitly cleared description is saved instead of retaining the old text', async () => {
  const f = fixture(); f.product = { ...f.product, descriptionAr: 'وصف قديم' };
  await f.service.update(undefined, 'p', { descriptionAr: '', expectedContentRevision: 'a'.repeat(64) });
  assert.equal(f.product.descriptionAr, undefined);
});
