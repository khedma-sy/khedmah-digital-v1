import assert from 'node:assert/strict';
import test from 'node:test';
import { restaurantDeliveryPricingFromEnvironment } from './restaurant-delivery-pricing';

test('restaurant delivery pricing is currency scoped', () => {
  const env = {
    RESTAURANT_DELIVERY_PRICING_JSON: JSON.stringify({
      SYP: { baseFeeMinor: 50000, perKmMinor: 10000, minimumFeeMinor: 50000, maximumFeeMinor: 250000, pickupBufferMinutes: 10 },
      USD: { baseFeeMinor: 100, perKmMinor: 25, minimumFeeMinor: 100, maximumFeeMinor: 1000, pickupBufferMinutes: 10 },
    }),
  };
  assert.deepEqual(restaurantDeliveryPricingFromEnvironment('SYP', env), {
    baseFeeMinor: 50000, perKmMinor: 10000, minimumFeeMinor: 50000, maximumFeeMinor: 250000, pickupBufferMinutes: 10,
  });
  assert.deepEqual(restaurantDeliveryPricingFromEnvironment('USD', env), {
    baseFeeMinor: 100, perKmMinor: 25, minimumFeeMinor: 100, maximumFeeMinor: 1000, pickupBufferMinutes: 10,
  });
});

test('restaurant delivery pricing fails closed for missing, malformed, or inverted bounds', () => {
  assert.throws(() => restaurantDeliveryPricingFromEnvironment('SYP', {}), /not configured/);
  assert.throws(() => restaurantDeliveryPricingFromEnvironment('SYP', { RESTAURANT_DELIVERY_PRICING_JSON: '{' }), /invalid/);
  assert.throws(() => restaurantDeliveryPricingFromEnvironment('SYP', {
    RESTAURANT_DELIVERY_PRICING_JSON: JSON.stringify({
      SYP: { baseFeeMinor: 1, perKmMinor: 1, minimumFeeMinor: 10, maximumFeeMinor: 5, pickupBufferMinutes: 1 },
    }),
  }), /bounds/);
});

test('restaurant delivery pricing refuses null, booleans, strings and unsafe numeric configuration', () => {
  const valid = {
    baseFeeMinor: 50000,
    perKmMinor: 10000,
    minimumFeeMinor: 50000,
    maximumFeeMinor: 250000,
    pickupBufferMinutes: 10,
  };
  for (const field of Object.keys(valid)) {
    for (const invalid of [null, false, true, '0', '250', [], {}, -1, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
      const env = {
        RESTAURANT_DELIVERY_PRICING_JSON: JSON.stringify({ SYP: { ...valid, [field]: invalid } }),
      };
      assert.throws(
        () => restaurantDeliveryPricingFromEnvironment('SYP', env),
        new RegExp(field),
        `Expected ${field}=${JSON.stringify(invalid)} to fail closed`,
      );
    }
  }
});
