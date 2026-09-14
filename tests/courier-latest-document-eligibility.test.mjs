import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile(new URL('../apps/backend/src/orders/order.repository.ts', import.meta.url), 'utf8');
const service = await readFile(new URL('../apps/backend/src/orders/order.service.ts', import.meta.url), 'utf8');

test('courier eligibility counts only the latest review for each required document type', () => {
  assert.match(repository, /SELECT DISTINCT ON \(document_type\) document_type,status/);
  assert.match(repository, /document_type IN \('driver_photo','identity_card','driving_license','vehicle_license'\)/);
  assert.match(repository, /ORDER BY document_type,created_at DESC,media_asset_id DESC/);
  assert.match(repository, /\) latest\s+WHERE latest\.status='approved'/);
  assert.doesNotMatch(repository, /COUNT\(\*\)::text AS count FROM mobility_document_reviews\s+WHERE business_profile_id=\$1 AND status='approved'/);
});

test('courier eligibility is rechecked at assignment, acceptance and pickup', () => {
  assert.match(service, /countApprovedMobilityDocuments\(b\.id\) !== 4/);
  assert.match(service, /o\.status === "courier_assigned" && action\.status === "courier_accepted"[\s\S]*assertCourierEligible/);
  assert.match(service, /o\.status === "ready_for_pickup" && action\.status === "picked_up"[\s\S]*assertCourierEligible/);
  assert.match(service, /categoryCode !== "delivery_courier"/);
  assert.match(service, /visibility !== "public"/);
  assert.match(service, /trustStatus !== "approved"/);
  assert.match(service, /moderationStatus !== "approved"/);
  assert.match(service, /status !== "active"/);
});
