import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requireRestaurantPushMerchantEligibility,
  RestaurantPushMerchantAccessDenied,
} from './restaurant-push-merchant-policy';

const actor = { id: 'user-merchant', status: 'active' as const };
const merchant = {
  id: 'business-restaurant',
  ownerUserId: 'user-merchant',
  categoryCode: 'restaurant',
  visibility: 'public' as const,
  moderationStatus: 'approved' as const,
  trustStatus: 'approved' as const,
  status: 'active' as const,
};

function denied(run: () => unknown) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof RestaurantPushMerchantAccessDenied);
    assert.equal(error.message, 'Restaurant push merchant access denied.');
    return true;
  });
}

test('eligible approved restaurant is bound to the session owner and canonical business ID', () => {
  assert.deepEqual(requireRestaurantPushMerchantEligibility(actor, merchant, merchant.id), {
    userId: 'user-merchant',
    businessId: 'business-restaurant',
  });
  for (const categoryCode of ['restaurant', 'cafe', 'bakery', 'sweets', 'catering', 'juice_icecream']) {
    assert.deepEqual(requireRestaurantPushMerchantEligibility(actor, { ...merchant, categoryCode }, merchant.id), {
      userId: actor.id,
      businessId: merchant.id,
    });
  }
});

test('missing, forged or cross-tenant identity cannot authorize restaurant push enrollment', () => {
  denied(() => requireRestaurantPushMerchantEligibility(null, merchant, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(actor, null, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(
    { ...actor, id: 'attacker' }, merchant, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(actor, {
    ...merchant, ownerUserId: 'another-user',
  }, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(actor, merchant, 'another-business'));
  denied(() => requireRestaurantPushMerchantEligibility(
    { ...actor, status: 'pending' }, merchant, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(
    { ...actor, status: 'suspended' }, merchant, merchant.id));
});

test('private, unapproved, suspended and non-food merchants cannot enroll', () => {
  for (const change of [
    { visibility: 'private' as const },
    { moderationStatus: 'pending' as const },
    { moderationStatus: 'rejected' as const },
    { moderationStatus: 'suspended' as const },
    { trustStatus: 'pending' as const },
    { trustStatus: 'suspended' as const },
    { status: 'suspended' as const },
    { categoryCode: 'taxi' },
    { categoryCode: 'delivery_courier' },
    { categoryCode: 'grocery' },
    { categoryCode: '' },
  ]) {
    denied(() => requireRestaurantPushMerchantEligibility(
      actor, { ...merchant, ...change }, merchant.id,
    ));
  }
});

test('missing and malformed identifiers fail closed with a non-disclosing denial', () => {
  for (const value of [null, undefined, '', ' business-restaurant', 'business-restaurant\n', 0, {}]) {
    denied(() => requireRestaurantPushMerchantEligibility(actor, merchant, value));
  }
  denied(() => requireRestaurantPushMerchantEligibility(
    { ...actor, id: 'user-merchant\n' }, merchant, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(actor, {
    ...merchant, id: 'business-restaurant\t',
  }, merchant.id));
  denied(() => requireRestaurantPushMerchantEligibility(actor, {
    ...merchant, ownerUserId: 'user-merchant ',
  }, merchant.id));
});
