import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCreateFoodPromotion, validateFoodPromotionStatus } from './food-promotion.validation';
import { validateCreateOrder, validateOrderQuote } from './order.validation';

const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

test('food promotion input normalizes codes and keeps bounded restaurant-funded economics', () => {
  const input = validateCreateFoodPromotion({
    businessId: 'restaurant-1', code: ' food_20 ', nameAr: 'خصم نهاية الأسبوع',
    discountType: 'percentage', percentageOff: 20, currency: 'SYP',
    minimumSubtotal: 1000, maximumDiscount: 5000,
    validFrom: future(-1), validUntil: future(60), maxRedemptions: 200, perUserLimit: 2,
  });
  assert.equal(input.code, 'FOOD_20');
  assert.equal(input.percentageOff, 20);
  assert.equal(input.maximumDiscount, 5000);
  assert.equal(input.fixedAmount, undefined);
});

test('food promotion input rejects ambiguous, unsafe and expired campaign shapes', () => {
  const base = { businessId: 'restaurant-1', code: 'FOOD20', nameAr: 'خصم المطعم', currency: 'SYP', validFrom: future(-1), validUntil: future(60), perUserLimit: 1 };
  assert.throws(() => validateCreateFoodPromotion({ ...base, discountType: 'percentage', percentageOff: 91, minimumSubtotal: 0 }), /percentageOff/);
  assert.throws(() => validateCreateFoodPromotion({ ...base, discountType: 'fixed', fixedAmount: 500, minimumSubtotal: 500 }), /greater than fixedAmount/);
  assert.throws(() => validateCreateFoodPromotion({ ...base, discountType: 'fixed', fixedAmount: 100, minimumSubtotal: 500, maximumDiscount: 50 }), /only for percentage/);
  assert.throws(() => validateCreateFoodPromotion({ ...base, discountType: 'percentage', percentageOff: 10, minimumSubtotal: 0, validUntil: future(-2) }), /validUntil/);
  assert.throws(() => validateCreateFoodPromotion({ ...base, discountType: 'percentage', percentageOff: 10, minimumSubtotal: 0, maxRedemptions: 1, perUserLimit: 2 }), /lower than perUserLimit/);
  assert.throws(() => validateCreateFoodPromotion({ ...base, code: 'خصم20', discountType: 'percentage', percentageOff: 10, minimumSubtotal: 0 }), /promoCode/);
});

test('checkout requires the reviewed quote snapshot whenever a promotion is submitted', () => {
  const base = { items: [{ productListingId: 'product-1', quantity: 2 }], deliveryAddress: 'دمشق المزة', customerPhone: '0999999999' };
  assert.throws(() => validateCreateOrder({ ...base, promoCode: 'food20' }), /reviewed food promotion quote/);
  assert.throws(() => validateCreateOrder({ ...base, expectedSubtotal: 2000 }), /require promoCode/);
  const result = validateCreateOrder({ ...base, promoCode: 'food20', expectedSubtotal: 2000, expectedDiscountAmount: 200 });
  assert.equal(result.promoCode, 'FOOD20');
  assert.equal(result.expectedSubtotal, 2000);
  assert.equal(result.expectedDiscountAmount, 200);
  assert.deepEqual(validateOrderQuote({ items: base.items, promoCode: 'food20' }).promoCode, 'FOOD20');
});

test('promotion activation uses an explicit optimistic concurrency timestamp', () => {
  const timestamp = new Date().toISOString();
  assert.deepEqual(validateFoodPromotionStatus({ active: false, expectedUpdatedAt: timestamp }), { active: false, expectedUpdatedAt: timestamp });
  assert.throws(() => validateFoodPromotionStatus({ active: 'false', expectedUpdatedAt: timestamp }), /active/);
  assert.throws(() => validateFoodPromotionStatus({ active: true }), /expectedUpdatedAt/);
});
