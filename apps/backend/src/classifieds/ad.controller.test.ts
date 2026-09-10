import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminAdController } from './ad.controller';
import type { AdService } from './ad.service';
import type { AdListing } from './ad.types';

const ad: AdListing = {
  id: 'ad-queue-1',
  ownerUserId: 'owner-1',
  businessProfileId: 'business-1',
  kind: 'sale',
  titleAr: 'إعلان كامل للمراجعة',
  descriptionAr: 'وصف واضح يسمح للمشرف بمراجعة المحتوى.',
  categoryCode: 'cars',
  priceMode: 'fixed',
  priceMinor: 125000,
  currency: 'SYP',
  cityCode: 'damascus',
  contactMode: 'profile',
  status: 'pending_review',
  imageUrls: ['/api/v1/classifieds-media/image-1'],
  submittedAt: '2026-09-10T00:00:00.000Z',
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
  revision: 8,
  contentRevision: 5,
  reviewRevision: 3
};

test('pending admin queue attaches assessment to the exact review snapshot without deciding it', async () => {
  let moderationCalls = 0;
  const service = {
    listPending: async () => [{ ...ad }],
    moderate: async () => { moderationCalls += 1; return { ...ad }; }
  } as unknown as AdService;
  const controller = new AdminAdController(service);
  const response = await controller.pending('sid=fake');

  assert.equal(response.ads.length, 1);
  assert.equal(response.ads[0].reviewRevision, 3);
  assert.equal(response.ads[0].smartAdmin.reviewRevision, 3);
  assert.equal(response.ads[0].smartAdmin.version, 'classifieds-smart-admin-v1');
  assert.equal(response.ads[0].smartAdmin.humanDecisionRequired, true);
  assert.equal(response.ads[0].smartAdmin.automatedDecisionAllowed, false);
  assert.equal(moderationCalls, 0, 'reading the moderation queue must never perform a moderation decision');
});
