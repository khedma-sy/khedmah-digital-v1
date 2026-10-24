import assert from 'node:assert/strict';
import test from 'node:test';
import { sendRestaurantPush } from './restaurant-push-sender';

test('restaurant push sender emits only bounded order metadata', async () => {
  let sent;
  const result = await sendRestaurantPush({
    async send(message) { sent = message; return 'message-1'; },
  }, {
    token: 'fcm-token-value-1234567890',
    title: 'طلب جديد',
    body: 'وصل طلب جديد للمراجعة.',
    orderId: 'order-123',
    status: 'placed',
  });
  assert.equal(result.messageId, 'message-1');
  assert.deepEqual(sent, {
    token: 'fcm-token-value-1234567890',
    notification: { title: 'طلب جديد', body: 'وصل طلب جديد للمراجعة.' },
    data: { orderId: 'order-123', status: 'placed', vertical: 'food' },
    webpush: { fcmOptions: { link: '/orders/merchant?orderId=order-123' } },
  });
  assert.doesNotMatch(JSON.stringify(sent), /customerPhone|deliveryAddress|latitude|longitude/);
});

test('restaurant push sender rejects malformed input and invalid sender response', async () => {
  const messaging = { async send() { return 'message-1'; } };
  await assert.rejects(sendRestaurantPush(messaging, {
    token: 'short',
    title: 'طلب',
    body: 'نص',
    orderId: 'order-1',
    status: 'placed',
  }), /token/);
  await assert.rejects(sendRestaurantPush({ async send() { return ''; } }, {
    token: 'fcm-token-value-1234567890',
    title: 'طلب',
    body: 'نص',
    orderId: 'order-1',
    status: 'placed',
  }), /message id/);
});
