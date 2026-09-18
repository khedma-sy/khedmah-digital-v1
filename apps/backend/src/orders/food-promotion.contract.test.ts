import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const orderRepository = read('./order.repository.ts');
const promotionRepository = read('./food-promotion.repository.ts');
const controller = read('./food-promotion.controller.ts');

test('promotion quote is merchant scoped and atomic creation serializes limits and snapshots one claim', () => {
  assert.match(orderRepository, /WHERE merchant_business_id=\$1 AND code=\$2\$\{lock \? " FOR UPDATE" : ""\}/);
  assert.match(orderRepository, /status IN \('applied','redeemed'\)/);
  assert.match(orderRepository, /pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/);
  assert.match(orderRepository, /promotionQuote\(client,[\s\S]*}, true\)/);
  assert.match(orderRepository, /INSERT INTO fulfillment_orders[\s\S]*INSERT INTO food_promo_claims/);
  assert.match(orderRepository, /expectedDiscountAmount !== quote\.discountAmount/);
});

test('claim state follows order authority and rolls back with the containing transaction', () => {
  assert.match(orderRepository, /FOR UPDATE OF promo,claim/);
  assert.match(orderRepository, /next === "cancelled" \|\| next === "rejected"/);
  assert.match(orderRepository, /SET status='released',redeemed_at=NULL,released_at=\$2/);
  assert.match(orderRepository, /status IN \('applied','redeemed'\)/);
  assert.match(orderRepository, /order\.status === "quoted" && next === "merchant_confirmed"/);
  assert.match(orderRepository, /SET status='redeemed',redeemed_at=\$2/);
  assert.match(orderRepository, /FOOD_PROMOTION_(?:CLAIM_MISSING|RELEASE_STATE_INVALID|REDEMPTION_STATE_INVALID)/);
});

test('campaign provisioning is restricted to the current owner of an approved food business', () => {
  for (const required of ["owner_user_id=$2", "category_code=ANY($3::text[])", "visibility='public'", "moderation_status='approved'", "trust_status='approved'", "status='active'", 'expectedUpdatedAt']) assert.match(promotionRepository, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(controller, /@Controller\("food-promotions"\)/);
  assert.match(controller, /@Header\("Cache-Control", "private, no-store"\)/);
  assert.match(controller, /@Header\("Vary", "Cookie"\)/);
});
