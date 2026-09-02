import assert from 'node:assert/strict';
import test from 'node:test';
import type { BusinessProfile } from '../business-profiles/business-profile.types';
import type { ProductListing } from './product.types';
import { evaluateProductAutoModeration } from './product-auto-moderation';

const now = new Date().toISOString();
const product: ProductListing = {
  id: 'product-1', businessProfileId: 'business-1', ownerUserId: 'owner-1',
  titleAr: 'طاولة خشبية منزلية', descriptionAr: 'طاولة خشبية متينة مناسبة لغرفة الجلوس وبحالة ممتازة.',
  price: 100, currency: 'USD', categoryCode: 'furniture', availability: 'in_stock',
  status: 'active', moderationStatus: 'pending', createdAt: now, updatedAt: now
};
const business: BusinessProfile = {
  id: 'business-1', name: 'نشاط موثق', ownerUserId: 'owner-1', visibility: 'public', moderationStatus: 'approved',
  trustStatus: 'approved', status: 'active', categoryCode: 'furniture', cityCode: 'damascus', countryCode: 'SY',
  isFeatured: false, createdAt: now, updatedAt: now
};

test('objective low-risk product from an eligible seller is auto-approved', () => {
  assert.deepEqual(evaluateProductAutoModeration(product, business, true, true), {
    approved: true, reasons: [], policyVersion: 'product-auto-v1'
  });
});

test('uncertain or high-risk product remains pending without automatic rejection', () => {
  const decision = evaluateProductAutoModeration({ ...product, titleAr: 'سلاح للبيع', descriptionAr: 'وصف قصير' }, { ...business, trustStatus: 'pending' }, false, false);
  assert.equal(decision.approved, false);
  for (const reason of ['seller_not_eligible', 'category_not_active', 'image_missing', 'description_too_short', 'high_risk_content']) assert.ok(decision.reasons.includes(reason as never));
});
