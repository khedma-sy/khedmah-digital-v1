import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  TAXI_VEHICLE_CLASSES,
  applyTaxiFareMultiplier,
  applyTaxiVehicleClassFare,
  effectiveTaxiVehicleClass,
  quoteTaxiVehicleClasses,
} from '../apps/backend/src/taxi/taxi-vehicle-classes.ts';
import {
  buildSmartRestaurantOfferDraft,
} from '../apps/frontend/lib/restaurant-smart-offer.ts';

test('taxi vehicle catalog exposes economy comfort suv and van with increasing capacity', () => {
  assert.deepEqual(TAXI_VEHICLE_CLASSES.map((item) => item.code), ['economy','comfort','suv','van']);
  assert.deepEqual(TAXI_VEHICLE_CLASSES.map((item) => item.seats), [4,4,6,8]);
});

test('legacy Taxi approval without an explicit class is restricted to economy', () => {
  assert.equal(effectiveTaxiVehicleClass(undefined), 'economy');
  assert.equal(effectiveTaxiVehicleClass(null), 'economy');
  assert.equal(effectiveTaxiVehicleClass('comfort'), 'comfort');
});

test('Taxi offer SQL filters class before LIMIT 100', async () => {
  const source = await readFile(new URL('../apps/backend/src/taxi/engine/server/taxi-service.ts', import.meta.url), 'utf8');
  assert.match(source, /vehicleClass.*ORDER BY id LIMIT 100/s);
  assert.match(source, /provider\.vehicleClass\?\?'economy'/);
});

test('taxi vehicle class fare multiplier keeps economy base and scales larger classes', () => {
  assert.equal(applyTaxiVehicleClassFare(10_000, 'economy'), 10_000);
  assert.equal(applyTaxiVehicleClassFare(10_000, 'comfort'), 12_500);
  assert.equal(applyTaxiVehicleClassFare(10_000, 'suv'), 15_500);
  assert.equal(applyTaxiVehicleClassFare(10_000, 'van'), 19_000);
  assert.deepEqual(quoteTaxiVehicleClasses(10_000).map((q) => q.totalMinor), [10_000,12_500,15_500,19_000]);
});

test('pure taxi fare multiplier preserves selected vehicle-class scaling for server quote and completion paths', () => {
  assert.equal(applyTaxiFareMultiplier(1100, 10_000), 1100);
  assert.equal(applyTaxiFareMultiplier(1100, 12_500), 1375);
  assert.equal(applyTaxiFareMultiplier(1100, 15_500), 1705);
  assert.equal(applyTaxiFareMultiplier(1100, 19_000), 2090);
  assert.throws(() => applyTaxiFareMultiplier(1100, 0), /multiplier/);
});

test('smart restaurant offer drafts simple bounded percentage campaigns as auto-publish eligible', () => {
  const draft = buildSmartRestaurantOfferDraft({
    businessId:'restaurant-1', code:'lunch20', nameAr:'عرض الغداء',
    currency:'SYP', kind:'percentage', percentageOff:20,
    minimumSubtotal:1000, maximumDiscount:500,
    validFrom:'2026-10-24T09:00:00Z', validUntil:'2026-10-24T13:00:00Z',
    maxRedemptions:100, perUserLimit:1,
  });
  assert.equal(draft.code,'LUNCH20');
  assert.equal(draft.smartReview.autoPublishEligible,true);
  assert.equal(draft.smartReview.requiresOwnerConfirmation,false);
});

test('smart restaurant offer requires owner confirmation for aggressive or unbounded campaign', () => {
  const draft = buildSmartRestaurantOfferDraft({
    businessId:'restaurant-1', code:'big50', nameAr:'عرض كبير',
    currency:'SYP', kind:'percentage', percentageOff:50,
    minimumSubtotal:1000,
    validFrom:'2026-10-24T09:00:00Z', validUntil:'2026-11-03T09:00:00Z',
    perUserLimit:4,
  });
  assert.equal(draft.smartReview.autoPublishEligible,false);
  assert.equal(draft.smartReview.requiresOwnerConfirmation,true);
  assert.ok(draft.smartReview.reasons.length >= 3);
});

test('fixed restaurant offer cannot equal or exceed minimum subtotal', () => {
  assert.throws(() => buildSmartRestaurantOfferDraft({
    businessId:'restaurant-1', code:'flat500', nameAr:'خصم ثابت',
    currency:'SYP', kind:'fixed', fixedAmount:500,
    minimumSubtotal:500,
    validFrom:'2026-10-24T09:00:00Z', validUntil:'2026-10-24T13:00:00Z',
  }), /minimumSubtotal/);
});
