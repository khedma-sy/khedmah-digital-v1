import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRingForMerchantOrders, MERCHANT_PENDING_ORDER_ALERT_REPEAT_MS } from '../apps/frontend/lib/merchant-order-alert-policy.ts';
import { showOrderNotification } from '../apps/frontend/app/orders/order-alerts.ts';

test('merchant alerts ring for newly seen pending orders and repeat at a bounded interval until handled', () => {
  const known = new Set(['old']);
  const now = 1_000_000;
  assert.equal(shouldRingForMerchantOrders(['new'], known, now, now + 1), true);
  assert.equal(shouldRingForMerchantOrders(['old'], known, null, now), true);
  assert.equal(shouldRingForMerchantOrders(['old'], known, now, now + MERCHANT_PENDING_ORDER_ALERT_REPEAT_MS - 1), false);
  assert.equal(shouldRingForMerchantOrders(['old'], known, now, now + MERCHANT_PENDING_ORDER_ALERT_REPEAT_MS), true);
  assert.equal(shouldRingForMerchantOrders([], known, now, now + MERCHANT_PENDING_ORDER_ALERT_REPEAT_MS), false);
});

test('merchant order list does not fail when a mobile browser forbids Notification constructor', () => {
  const originalWindow = globalThis.window;
  const originalNotification = globalThis.Notification;
  try {
    globalThis.window = { Notification: true };
    globalThis.Notification = class {
      static permission = 'granted';
      constructor() { throw new Error('constructor unsupported on this browser'); }
    };
    assert.doesNotThrow(() => showOrderNotification('طلب جديد', 'يرجى الرد', 'merchant-order-1'));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalNotification === undefined) delete globalThis.Notification;
    else globalThis.Notification = originalNotification;
  }
});
