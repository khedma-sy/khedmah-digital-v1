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
import { TaxiPricingAdminService } from './taxi-pricing.service';

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

test('Taxi pricing refuses stale administrator edits before writing a revision or changing a tariff',async()=>{
  let writes=0;
  const client={query:async(sql:string)=>{
    if(sql.includes('to_regclass'))return {rows:[{exists:true}]};
    if(sql.includes('FROM khedmah_taxi.tariffs')||sql.includes('FROM taxi_pricing_revisions'))return {rows:[{revision:'5'}]};
    if(/INSERT|UPDATE SET/.test(sql))writes++;
    return {rows:[]};
  }};
  const service=new TaxiPricingAdminService({transaction:async(work:Function)=>work(client)} as never,{getCurrentUser:async()=>({id:'admin'})} as never,{findAdminRoles:async()=>['bootstrap_admin']} as never);
  await assert.rejects(service.replaceActive('fixture',{...config,zoneCode:'test-zone',reason:'Reviewed price revision',expectedRevision:4}),/pricing changed/);
  assert.equal(writes,0);
  await assert.rejects(service.replaceActive('fixture',{...config,zoneCode:'test-zone',reason:'Reviewed price revision'}),/expectedRevision is invalid/);
});
