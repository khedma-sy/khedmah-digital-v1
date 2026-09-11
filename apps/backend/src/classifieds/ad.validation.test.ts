import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { CLASSIFIEDS_SMART_ADMIN_VERSION } from './ad-moderation-assessment';
import { validateAdCreate, validateAdModeration, validateAdRevisionAction, validateAdSubmit, validateAdUpdate } from './ad.validation';

const base = () => ({
  clientRequestId: 'classifieds-request-0001',
  kind: 'sale',
  titleAr: 'إعلان مستقل',
  categoryCode: 'home_services',
  priceMode: 'none',
  contactMode: 'profile'
});

test('classifieds create validation is allow-list based and rejects authority fields', () => {
  for (const field of ['ownerUserId', 'status', 'reviewRevision', 'revision', 'rejectionReason']) {
    assert.throws(() => validateAdCreate({ ...base(), [field]: 'forged' }), BadRequestException);
  }
  assert.equal(validateAdCreate(base()).input.titleAr, 'إعلان مستقل');
});

test('fixed and non-fixed price contracts are explicit', () => {
  assert.throws(() => validateAdCreate({ ...base(), priceMode: 'fixed' }), BadRequestException);
  const fixed = validateAdCreate({ ...base(), priceMode: 'fixed', priceMinor: 1200, currency: 'SYP' });
  assert.equal(fixed.input.priceMinor, 1200);
  assert.throws(() => validateAdCreate({ ...base(), priceMode: 'none', priceMinor: 1200 }), BadRequestException);
});

test('direct contact contract is explicit', () => {
  assert.throws(() => validateAdCreate({ ...base(), contactMode: 'phone' }), BadRequestException);
  assert.throws(() => validateAdCreate({ ...base(), contactMode: 'profile', contactValue: '0999999999' }), BadRequestException);
  assert.equal(validateAdCreate({ ...base(), contactMode: 'whatsapp', contactValue: '0999999999' }).input.contactValue, '0999999999');
});

test('write request keys and optimistic revisions are mandatory', () => {
  assert.throws(() => validateAdSubmit({ clientRequestId: 'short' }), BadRequestException);
  assert.throws(() => validateAdUpdate({ ...base(), titleAr: 'تعديل' }), BadRequestException);
  const update = validateAdUpdate({ clientRequestId: 'classifieds-update-0001', expectedContentRevision: 3, titleAr: 'تعديل' });
  assert.equal(update.expectedContentRevision, 3);
  const action = validateAdRevisionAction({ clientRequestId: 'classifieds-action-0001', expectedRevision: 5 });
  assert.equal(action.expectedRevision, 5);
});

test('moderation requires exact review revision, Smart Admin version, and rejection reason semantics', () => {
  assert.throws(() => validateAdModeration({ expectedReviewRevision: 1, decision: 'rejected' }), BadRequestException);
  assert.throws(() => validateAdModeration({ expectedReviewRevision: 1, expectedAssessmentVersion: 'classifieds-smart-admin-v0', decision: 'approved' }), BadRequestException);
  assert.throws(() => validateAdModeration({ expectedReviewRevision: 1, expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION, decision: 'approved', reason: 'no' }), BadRequestException);
  const rejected = validateAdModeration({
    expectedReviewRevision: 2,
    expectedAssessmentVersion: CLASSIFIEDS_SMART_ADMIN_VERSION,
    decision: 'rejected',
    reason: 'بيانات ناقصة'
  });
  assert.equal(rejected.reason, 'بيانات ناقصة');
  assert.equal(rejected.expectedAssessmentVersion, CLASSIFIEDS_SMART_ADMIN_VERSION);
});
