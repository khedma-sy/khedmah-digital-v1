import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  compileNewSyrianTaxiPricing,
  NEW_SYRIAN_POUND_CODE,
  NEW_SYRIAN_POUND_ERA,
  simulateNewSyrianTaxiFare,
  validateTaxiPricingConfig
} from './taxi-pricing.service';

const config = {
  openingFareMinor: 1000,
  perKmMinor: 500,
  waitPerMinuteMinor: 200,
  bookingFeeMinor: 300,
  minimumFareMinor: 2500,
  demandMultiplierBps: 12500,
  maxAmountMinor: 100000,
  quoteTtlMs: 120000
};

test('Taxi pricing is denominated in the 2026 new Syrian pound and compiles to the existing meter contract', () => {
  const validated = validateTaxiPricingConfig(config);
  const compiled = compileNewSyrianTaxiPricing(validated);
  assert.equal(compiled.currency, NEW_SYRIAN_POUND_CODE);
  assert.equal(compiled.currencyEra, NEW_SYRIAN_POUND_ERA);
  assert.equal(compiled.taxiBaseMinor, 1550);
  assert.equal(compiled.taxiPerKmMinor, 625);
  assert.equal(compiled.taxiWaitPerMinuteMinor, 250);
  assert.equal(compiled.taxiMinimumMinor, 2500);
});

test('Taxi pricing breakdown matches base + distance + waiting with minimum fare protection', () => {
  const result = simulateNewSyrianTaxiFare(validateTaxiPricingConfig(config), 4000, 120);
  assert.equal(result.openingAfterDemandMinor, 1250);
  assert.equal(result.bookingFeeMinor, 300);
  assert.equal(result.distanceMinor, 2500);
  assert.equal(result.waitingMinor, 500);
  assert.equal(result.minimumAdjustmentMinor, 0);
  assert.equal(result.totalMinor, 4550);
  assert.equal(result.currency, 'SYP');
});

test('Taxi pricing validation rejects non-integer money, unsafe demand multipliers and invalid ceilings', () => {
  assert.throws(() => validateTaxiPricingConfig({ ...config, openingFareMinor: 1.5 }), BadRequestException);
  assert.throws(() => validateTaxiPricingConfig({ ...config, demandMultiplierBps: 20001 }), BadRequestException);
  assert.throws(() => validateTaxiPricingConfig({ ...config, maxAmountMinor: 1000 }), BadRequestException);
});
