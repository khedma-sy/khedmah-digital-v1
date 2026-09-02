import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAction, validateOffer, validateRequest } from './professional-service.validation';

const request = { categoryCode:'electrician', titleAr:'عطل كهربائي', descriptionAr:'يوجد انقطاع متكرر في لوحة الكهرباء', urgency:'urgent', budgetMin:100, budgetMax:500, currency:'SYP', address:'دمشق المزة شارع واضح', areaLabel:'دمشق — المزة', latitude:33.5, longitude:36.2, customerPhone:'0999999999' };
test('professional request validates bounded problem, location and private contact inputs',()=>{const value=validateRequest(request);assert.equal(value.categoryCode,'electrician');assert.equal(value.urgency,'urgent');assert.equal(value.scheduledFor,undefined);});
test('scheduled request requires a date and rejects reversed budgets',()=>{assert.throws(()=>validateRequest({...request,urgency:'scheduled'}));assert.throws(()=>validateRequest({...request,budgetMin:600,budgetMax:500}));});
test('provider offer preserves itemized cash quote, ETA and warranty',()=>{const value=validateOffer({inspectionFee:50,laborFee:200,materialsFee:100,currency:'SYP',arrivalMinutes:30,durationMinutes:90,warrantyDays:30,scopeAr:'إصلاح العطل واستبدال القطعة التالفة'});assert.equal(value.warrantyDays,30);assert.equal(value.laborFee,200);});
test('job lifecycle accepts only governed actions',()=>{assert.equal(validateAction({action:'confirm_completion'}).action,'confirm_completion');assert.throws(()=>validateAction({action:'complete_without_customer'}));});
