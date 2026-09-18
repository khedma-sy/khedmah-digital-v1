import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checkout = read('app/orders/checkout/page.tsx');
const merchant = read('app/orders/merchant/page.tsx');
const orders = read('app/orders/page.tsx');
const client = read('lib/recovered-service-client.ts');

test('food checkout reviews a server quote and submits its exact promotion snapshot', () => {
  assert.match(checkout, /api\.orders\.quote/);
  assert.match(checkout, /promoCode:\s*code/);
  assert.match(checkout, /expectedSubtotal:\s*quote\?\.promotion \? quote\.subtotal/);
  assert.match(checkout, /expectedDiscountAmount:\s*quote\?\.promotion \? quote\.discountAmount/);
  assert.match(checkout, /طبّق كود الخصم وراجع الإجمالي/);
  assert.match(checkout, /رسوم التوصيل لا يشملها الخصم/);
  assert.doesNotMatch(checkout, /paymentIntent|cardNumber|stripe|paypal/i);
});

test('checkout reuses one idempotency key for an identical retry and rotates it after payload edits', () => {
  assert.match(checkout, /createAttempt = useRef<\{ fingerprint: string; key: string \} \| null>/);
  assert.match(checkout, /const fingerprint = JSON\.stringify\(payload\)/);
  assert.match(checkout, /createAttempt\.current\.fingerprint !== fingerprint/);
  assert.match(checkout, /createAttempt\.current = \{ fingerprint, key: crypto\.randomUUID\(\) \}/);
  assert.match(checkout, /api\.orders\.create\(payload, createAttempt\.current\.key\)/);
});

test('restaurant owner can provision and pause bounded merchant-funded campaigns', () => {
  for (const required of ['api.foodPromotions.list','api.foodPromotions.create','api.foodPromotions.setActive','أكواد الخصم','تمويل المطعم','لا تموله المنصة','maxRedemptions','perUserLimit']) assert.match(merchant, new RegExp(required.replace('.', '\\.')));
  assert.match(client, /\/food-promotions\?businessId=/);
  assert.match(client, /\/food-promotions\/\$\{encodeURIComponent\(id\)\}\/status/);
  assert.match(client, /\/orders\/quote/);
});

test('customer and merchant order views expose the persisted discount breakdown', () => {
  assert.match(orders, /order\.promoCode/);
  assert.match(orders, /order\.discountAmount/);
  assert.match(orders, /order\.subtotal\s*-\s*order\.discountAmount/);
  assert.match(merchant, /o\.promoCode&&o\.discountAmount>0/);
  assert.match(merchant, /o\.subtotal-o\.discountAmount/);
});
