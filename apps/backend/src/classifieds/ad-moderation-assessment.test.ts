import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessAdForModeration } from './ad-moderation-assessment';
import type { AdListing } from './ad.types';

const makeAd = (patch: Partial<AdListing> = {}): AdListing => ({
  id: 'ad-1',
  ownerUserId: 'user-1',
  businessProfileId: 'business-1',
  kind: 'sale',
  titleAr: 'إعلان للمراجعة',
  descriptionAr: 'وصف واضح للمراجعة',
  categoryCode: 'cars',
  priceMode: 'fixed',
  priceMinor: 250000,
  currency: 'SYP',
  cityCode: 'damascus',
  contactMode: 'profile',
  status: 'pending_review',
  imageUrls: ['/api/v1/classifieds-media/one'],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  revision: 8,
  contentRevision: 5,
  reviewRevision: 3,
  ...patch
});

test('smart admin assessment is deterministic and never authorizes an automatic decision', () => {
  const first = assessAdForModeration(makeAd());
  const second = assessAdForModeration(makeAd());
  assert.deepEqual(first, second);
  assert.equal(first.priority, 'standard');
  assert.equal(first.completeness, 'complete');
  assert.equal(first.humanDecisionRequired, true);
  assert.equal(first.automatedDecisionAllowed, false);
  assert.equal(first.reviewRevision, 3);
});

test('smart admin elevates structurally incomplete direct-contact ads without deciding them', () => {
  const assessment = assessAdForModeration(makeAd({
    businessProfileId: undefined,
    descriptionAr: undefined,
    contactMode: 'phone',
    contactValue: '0999999999',
    imageUrls: []
  }));
  const codes = assessment.signals.map((signal) => signal.code);
  assert.equal(assessment.priority, 'elevated');
  assert.equal(assessment.completeness, 'needs_attention');
  assert.equal(assessment.automatedDecisionAllowed, false);
  assert.ok(codes.includes('NO_DESCRIPTION'));
  assert.ok(codes.includes('NO_IMAGE'));
  assert.ok(codes.includes('UNLINKED_BUSINESS'));
  assert.ok(codes.includes('DIRECT_CONTACT'));
});

test('smart admin exposes invalid price and review snapshot as attention signals', () => {
  const assessment = assessAdForModeration(makeAd({
    priceMinor: undefined,
    currency: undefined,
    reviewRevision: 0
  }));
  const codes = assessment.signals.map((signal) => signal.code);
  assert.equal(assessment.priority, 'elevated');
  assert.ok(codes.includes('PRICE_CONTRACT_MISMATCH'));
  assert.ok(codes.includes('REVIEW_REVISION_INVALID'));
  assert.equal(assessment.humanDecisionRequired, true);
});

test('profile contact without a linked business is explicitly flagged', () => {
  const assessment = assessAdForModeration(makeAd({ businessProfileId: undefined }));
  const codes = assessment.signals.map((signal) => signal.code);
  assert.ok(codes.includes('UNLINKED_BUSINESS'));
  assert.ok(codes.includes('PROFILE_WITHOUT_BUSINESS'));
  assert.equal(assessment.priority, 'elevated');
});
