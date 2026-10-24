import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteRestaurantDelivery } from './restaurant-delivery-quote';

const pricing = {
  baseFeeMinor: 500,
  perKmMinor: 200,
  minimumFeeMinor: 700,
  maximumFeeMinor: 5000,
  pickupBufferMinutes: 10,
};

test('restaurant delivery quote uses trusted route distance and duration', () => {
  const now = 1_000_000;
  const quote = quoteRestaurantDelivery({
    distanceMeters: 5500,
    durationSeconds: 900,
    verified: true,
    source: 'test-router',
    referenceId: 'route-1',
    expiresAt: now + 60_000,
  }, pricing, now);
  assert.equal(quote.deliveryFeeMinor, 1600);
  assert.equal(quote.etaMinutes, 25);
  assert.equal(quote.distanceMeters, 5500);
  assert.deepEqual(quote.routeReference, { source: 'test-router', id: 'route-1', expiresAt: now + 60_000 });
});

test('restaurant delivery quote fails closed for untrusted or expired routing', () => {
  const now = 1_000_000;
  assert.throws(() => quoteRestaurantDelivery({
    distanceMeters: 1000, durationSeconds: 300, verified: false,
    source: 'browser', referenceId: 'route-2', expiresAt: now + 60_000,
  }, pricing, now), /Trusted restaurant route/);
  assert.throws(() => quoteRestaurantDelivery({
    distanceMeters: 1000, durationSeconds: 300, verified: true,
    source: 'router', referenceId: 'route-3', expiresAt: now,
  }, pricing, now), /expired/);
});

test('restaurant delivery quote applies configured floor and ceiling', () => {
  const now = 1_000_000;
  const floor = quoteRestaurantDelivery({
    distanceMeters: 100, durationSeconds: 60, verified: true,
    source: 'router', referenceId: 'route-4', expiresAt: now + 60_000,
  }, pricing, now);
  assert.equal(floor.deliveryFeeMinor, 700);
  const ceiling = quoteRestaurantDelivery({
    distanceMeters: 100_000, durationSeconds: 3600, verified: true,
    source: 'router', referenceId: 'route-5', expiresAt: now + 60_000,
  }, pricing, now);
  assert.equal(ceiling.deliveryFeeMinor, 5000);
});
