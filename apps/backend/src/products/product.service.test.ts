import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service';
import { plannedAdvertisingPackages } from './product-policy';

const validRequest = {
  businessProfileId: 'business-1', titleAr: 'منتج صالح', descriptionAr: 'وصف واضح وكاف للمنتج المعروض للبيع.',
  price: 100, currency: 'SYP', categoryCode: 'furniture', availability: 'in_stock'
};

test('product creation enforces the per-user listing limit at the repository boundary', async () => {
  const repository = { insertWithinOwnerLimit: async (_product: unknown, limit: number) => { assert.equal(limit, 3); return false; } };
  const businesses = { findById: async () => ({ id: 'business-1', ownerUserId: 'owner-1' }) };
  const categories = { assertActiveCategory: async () => undefined };
  const identity = { getCurrentUser: async () => ({ id: 'owner-1' }) };
  const service = new ProductService(repository as never, businesses as never, categories as never, identity as never, {} as never);
  await assert.rejects(() => service.create(undefined, validRequest), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match(error.message, /الحد المتاح وهو 3/);
    return true;
  });
});

test('configured product limit is returned to the owner UI and used for creation', async () => {
  const previous = process.env.PRODUCT_LISTING_LIMIT_PER_USER;
  const previousPaid = process.env.PAID_ADVERTISING_ENABLED;
  const previousPricing = process.env.ADVERTISING_PRICING_PUBLISHED;
  const previousCheckout = process.env.ADVERTISING_CHECKOUT_ENABLED;
  process.env.PAID_ADVERTISING_ENABLED = 'true';
  process.env.ADVERTISING_PRICING_PUBLISHED = 'true';
  process.env.ADVERTISING_CHECKOUT_ENABLED = 'true';
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
    if (previousPaid === undefined) delete process.env.PAID_ADVERTISING_ENABLED;
    else process.env.PAID_ADVERTISING_ENABLED = previousPaid;
    if (previousPricing === undefined) delete process.env.ADVERTISING_PRICING_PUBLISHED;
    else process.env.ADVERTISING_PRICING_PUBLISHED = previousPricing;
    if (previousCheckout === undefined) delete process.env.ADVERTISING_CHECKOUT_ENABLED;
    else process.env.ADVERTISING_CHECKOUT_ENABLED = previousCheckout;
  }
});

test('free launch phase remains capped at three even when a stale configured limit exists',()=>{const previous=process.env.PRODUCT_LISTING_LIMIT_PER_USER,previousPaid=process.env.PAID_ADVERTISING_ENABLED;process.env.PRODUCT_LISTING_LIMIT_PER_USER='35';delete process.env.PAID_ADVERTISING_ENABLED;try{const service=new ProductService({}as never,{}as never,{}as never,{}as never,{}as never);assert.equal(service.listingLimitPerUser(),3);}finally{if(previous===undefined)delete process.env.PRODUCT_LISTING_LIMIT_PER_USER;else process.env.PRODUCT_LISTING_LIMIT_PER_USER=previous;if(previousPaid===undefined)delete process.env.PAID_ADVERTISING_ENABLED;else process.env.PAID_ADVERTISING_ENABLED=previousPaid;}});

test('paid advertising cannot activate before pricing and checkout are both ready',()=>{const previousPaid=process.env.PAID_ADVERTISING_ENABLED,previousPricing=process.env.ADVERTISING_PRICING_PUBLISHED,previousCheckout=process.env.ADVERTISING_CHECKOUT_ENABLED,previousLimit=process.env.PRODUCT_LISTING_LIMIT_PER_USER;process.env.PAID_ADVERTISING_ENABLED='true';process.env.ADVERTISING_PRICING_PUBLISHED='true';delete process.env.ADVERTISING_CHECKOUT_ENABLED;process.env.PRODUCT_LISTING_LIMIT_PER_USER='50';try{const service=new ProductService({}as never,{}as never,{}as never,{}as never,{}as never);assert.deepEqual(service.advertisingPolicy(),{phase:'free_launch',listingLimitPerUser:3,paymentsEnabled:false,pricingPublished:false,checkoutEnabled:false,paidPlansStatus:'planned'});}finally{for(const[key,value]of[['PAID_ADVERTISING_ENABLED',previousPaid],['ADVERTISING_PRICING_PUBLISHED',previousPricing],['ADVERTISING_CHECKOUT_ENABLED',previousCheckout],['PRODUCT_LISTING_LIMIT_PER_USER',previousLimit]]as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}}});

test('planned paid packages have no invented price or purchasable state',()=>{const packages=plannedAdvertisingPackages();assert.deepEqual(packages.map(plan=>plan.code),['business_10','business_30','business_100','sponsored_7']);for(const plan of packages){assert.equal(plan.price,null);assert.equal(plan.currency,null);assert.equal(plan.purchasable,false);}const sponsored=packages.at(-1)!;assert.equal(sponsored.placement,'clearly_labelled_sponsored');assert.match(sponsored.featuresAr.join(' '),/لا يغيّر ترتيب النتائج العضوية/);});

test('inactive listing cannot bypass the owner quota when it is submitted again', async () => {
  const now = new Date().toISOString();
  const repository = {
    findById: async () => ({
      id: 'product-inactive', businessProfileId: 'business-1', ownerUserId: 'owner-1', titleAr: 'منتج محفوظ',
      descriptionAr: 'وصف واضح وكاف للمنتج المعروض للبيع.', price: 100, currency: 'SYP', categoryCode: 'furniture',
      availability: 'in_stock', requiresPrescription: false, controlledItem: false, status: 'inactive', moderationStatus: 'approved',
      createdAt: now, updatedAt: now
    }),
    hasPublicImage: async () => true,
    updateWithAutoModerationAudit: async (_product: unknown, _approved: boolean, limit: number) => {
      assert.equal(limit, 3);
      return false;
    }
  };
  const businesses = { findById: async () => ({ id: 'business-1', ownerUserId: 'owner-1', visibility: 'public', moderationStatus: 'approved', trustStatus: 'approved', status: 'active' }) };
  const categories = { assertActiveCategory: async () => undefined };
  const identity = { getCurrentUser: async () => ({ id: 'owner-1' }) };
  const service = new ProductService(repository as never, businesses as never, categories as never, identity as never, {} as never);
  await assert.rejects(() => service.submit(undefined, 'product-inactive'), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match(error.message, /الرصيد المتاح مكتمل/);
    return true;
  });
});

test('editing an inactive listing keeps it outside the active quota until guarded submission', async () => {
  const now = new Date().toISOString();
  let savedStatus = '';
  const repository = {
    findById: async () => ({
      id: 'product-inactive', businessProfileId: 'business-1', ownerUserId: 'owner-1', titleAr: 'منتج محفوظ',
      descriptionAr: 'وصف واضح وكاف للمنتج المعروض للبيع.', price: 100, currency: 'SYP', categoryCode: 'furniture',
      availability: 'in_stock', requiresPrescription: false, controlledItem: false, status: 'inactive', moderationStatus: 'approved',
      createdAt: now, updatedAt: now
    }),
    update: async (product: { status: string }) => { savedStatus = product.status; }
  };
  const identity = { getCurrentUser: async () => ({ id: 'owner-1' }) };
  const service = new ProductService(repository as never, {} as never, {} as never, identity as never, {} as never);
  const updated = await service.update(undefined, 'product-inactive', { titleAr: 'منتج معدل' });
  assert.equal(updated.status, 'inactive');
  assert.equal(savedStatus, 'inactive');
});
