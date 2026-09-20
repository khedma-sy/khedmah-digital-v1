import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validateAdImageDelete, validateAdImageUpload } from './ad-media.validation';

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const upload = () => ({
  clientRequestId: 'classifieds-media-request-0001',
  expectedContentRevision: 1,
  filename: 'ad.png',
  mimeType: 'image/png',
  sizeBytes: png.length,
  content: png.toString('base64'),
  sortOrder: 0
});

test('ad image upload requires idempotency and optimistic content revision', () => {
  assert.throws(() => validateAdImageUpload({ ...upload(), clientRequestId: 'short' }), BadRequestException);
  assert.throws(() => validateAdImageUpload({ ...upload(), expectedContentRevision: 0 }), BadRequestException);
  const valid = validateAdImageUpload(upload());
  assert.equal(valid.expectedContentRevision, 1);
  assert.equal(valid.mimeType, 'image/png');
});

test('ad image validation rejects authority fields and unsupported media types', () => {
  assert.throws(() => validateAdImageUpload({ ...upload(), ownerUserId: 'forged' }), BadRequestException);
  assert.throws(() => validateAdImageUpload({ ...upload(), assetType: 'product_image' }), BadRequestException);
  assert.throws(() => validateAdImageUpload({ ...upload(), mimeType: 'image/gif' }), BadRequestException);
});

test('ad image validation enforces declared size and sort-order envelope', () => {
  assert.throws(() => validateAdImageUpload({ ...upload(), sizeBytes: 0 }), BadRequestException);
  assert.throws(() => validateAdImageUpload({ ...upload(), sizeBytes: 5 * 1024 * 1024 + 1 }), BadRequestException);
  assert.throws(() => validateAdImageUpload({ ...upload(), sortOrder: 1001 }), BadRequestException);
});

test('ad image delete requires its own replay key and expected content revision', () => {
  assert.deepEqual(validateAdImageDelete({
    clientRequestId: 'classifieds-media-delete-0001', expectedContentRevision: 4
  }), {
    clientRequestId: 'classifieds-media-delete-0001', expectedContentRevision: 4
  });
  assert.throws(() => validateAdImageDelete({ expectedContentRevision: 4 }), BadRequestException);
});
