import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile(new URL('../apps/backend/src/orders/order.repository.ts', import.meta.url), 'utf8');
const service = await readFile(new URL('../apps/backend/src/orders/order.service.ts', import.meta.url), 'utf8');
const documentReview = await readFile(new URL('../apps/backend/src/media/driver-document-review.service.ts', import.meta.url), 'utf8');

test('courier eligibility counts only the latest review for each required document type', () => {
  assert.match(repository, /SELECT DISTINCT ON \(document_type\) document_type,status/);
  assert.match(repository, /document_type IN \('driver_photo','identity_card','driving_license','vehicle_license'\)/);
  assert.match(repository, /ORDER BY document_type,created_at DESC,media_asset_id DESC/);
  assert.match(repository, /\) latest\s+WHERE latest\.status='approved'/);
  assert.doesNotMatch(repository, /COUNT\(\*\)::text AS count FROM mobility_document_reviews\s+WHERE business_profile_id=\$1 AND status='approved'/);
});

test('courier credentials are rechecked at assignment, acceptance and pickup while pickup ignores new-job availability', () => {
  assert.match(service, /countApprovedMobilityDocuments\(courier\.id\) !== 4/);
  assert.match(service, /o\.status === "courier_assigned" && action\.status === "courier_accepted"[\s\S]*assertCourierEligible/);
  assert.match(service, /o\.status === "ready_for_pickup" && action\.status === "picked_up"[\s\S]*assertCourierEligible/);
  assert.match(service, /assertCourierEligible\(o\.courierBusinessId, o\.merchantBusinessId, false\)/);
  assert.match(service, /categoryCode !== "delivery_courier"/);
  assert.match(service, /visibility !== "public"/);
  assert.match(service, /trustStatus !== "approved"/);
  assert.match(service, /moderationStatus !== "approved"/);
  assert.match(service, /status !== "active"/);
  assert.match(service, /courier\.cityCode !== merchant\.cityCode/);
  assert.match(repository, /eligible\.city_code=\(SELECT merchant\.city_code FROM business_profiles merchant WHERE merchant\.id=fulfillment_orders\.merchant_business_id\)/);
  assert.match(repository, /\(\$11::text IS NULL OR courier_business_id=\$11\)/);
  assert.match(repository, /\(\$5::text IS NULL AND courier_business_id=\$10\)/);
  assert.match(service, /expectedCourierBusinessId: o\.courierBusinessId/);
  assert.match(repository, /\$13::text='merchant'[\s\S]*live_merchant\.owner_user_id=\$12/);
  assert.match(repository, /\$13::text='courier'[\s\S]*live_courier\.owner_user_id=\$12/);
  assert.match(repository, /merchant\.owner_user_id=\$2/);
  assert.match(repository, /courier\.owner_user_id=\$2/);
  assert.match(repository, /INSERT INTO fulfillment_order_location_updates[\s\S]*courier\.owner_user_id=\$3[\s\S]*o\.status IN \('courier_accepted','ready_for_pickup','picked_up'\)/);
  assert.match(repository, /trackingForActor[\s\S]*merchant\.owner_user_id=\$2 OR courier\.owner_user_id=\$2/);
  assert.match(repository, /protectedBusinessIds[\s\S]*business_profiles[\s\S]*ORDER BY id FOR UPDATE/);
  assert.match(repository, /options\.eligibleCourierBusinessId[\s\S]*FROM media_assets[\s\S]*ORDER BY id FOR UPDATE/);
  const reviewTransaction = documentReview.slice(documentReview.indexOf('return this.db.transaction(async client =>'));
  assert.ok(reviewTransaction.indexOf('FROM business_profiles WHERE id=$1 FOR UPDATE') < reviewTransaction.indexOf('SELECT owner_id,asset_type FROM media_assets'));
});

test('courier decline is race-bound and emits a distinct operational notification', () => {
  assert.match(service, /clearCourierBusinessId: true/);
  assert.match(repository, /transitionEventId \?\? input\.status/);
  assert.match(repository, /جاري اختيار مندوب آخر/);
  assert.match(repository, /اعتذر المندوب الحالي عن المهمة/);
});
