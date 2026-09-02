import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service';

const validRequest = {
  businessProfileId: 'business-1', titleAr: 'منتج صالح', descriptionAr: 'وصف واضح وكاف للمنتج المعروض للبيع.',
  price: 100, currency: 'SYP', categoryCode: 'furniture', availability: 'in_stock'
};

test('product creation enforces the per-user listing limit at the repository boundary', async () => {
  const repository = { insertWithinOwnerLimit: async (_product: unknown, limit: number) => { assert.equal(limit, 20); return false; } };
  const businesses = { findById: async () => ({ id: 'business-1', ownerUserId: 'owner-1' }) };
  const categories = { assertActiveCategory: async () => undefined };
  const identity = { getCurrentUser: async () => ({ id: 'owner-1' }) };
  const service = new ProductService(repository as never, businesses as never, categories as never, identity as never, {} as never);
  await assert.rejects(() => service.create(undefined, validRequest), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match(error.message, /limit of 20/);
    return true;
  });
});

test('configured product limit is returned to the owner UI and used for creation', async () => {
  const previous = process.env.PRODUCT_LISTING_LIMIT_PER_USER;
  process.env.PRODUCT_LISTING_LIMIT_PER_USER = '35';
  try {
    const repository = { insertWithinOwnerLimit: async (_product: unknown, limit: number) => limit === 35 };
    const businesses = { findById: async () => ({ id: 'business-1', ownerUserId: 'owner-1' }) };
    const categories = { assertActiveCategory: async () => undefined };
    const identity = { getCurrentUser: async () => ({ id: 'owner-1' }) };
    const service = new ProductService(repository as never, businesses as never, categories as never, identity as never, {} as never);
    assert.equal(service.listingLimitPerUser(), 35);
    assert.equal((await service.create(undefined, validRequest)).ownerUserId, 'owner-1');
  } finally {
    if (previous === undefined) delete process.env.PRODUCT_LISTING_LIMIT_PER_USER;
    else process.env.PRODUCT_LISTING_LIMIT_PER_USER = previous;
  }
});
