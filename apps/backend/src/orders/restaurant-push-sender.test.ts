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

test('restaurant push adds only an approved absolute HTTPS click link', async () => {
  let sent: unknown;
  const orderId = 'order-123?a=1&b=2';
  await sendRestaurantPush({
    async send(message) { sent = message; return 'message-2'; },
  }, {
    token: 'fcm-token-value-1234567890',
    title: 'طلب جديد',
    body: 'راجع الطلب',
    orderId,
    status: 'placed',
  }, { webAppOrigin: 'https://merchant.example/' });

  const message = sent as { webpush: { fcmOptions: { link: string } } };
  const url = new URL(message.webpush.fcmOptions.link);
  assert.equal(url.origin, 'https://merchant.example');
  assert.equal(url.pathname, '/orders/merchant');
  assert.equal(url.searchParams.get('orderId'), orderId);
  assert.deepEqual([...url.searchParams.keys()], ['orderId']);
});

test('restaurant push rejects unsafe click-link origins before sending', async () => {
  let sendCalls = 0;
  const messaging = { async send() { sendCalls += 1; return 'message-3'; } };
  const input = {
    token: 'fcm-token-value-1234567890',
    title: 'طلب جديد',
    body: 'راجع الطلب',
    orderId: 'order-123',
    status: 'placed',
  };
  for (const webAppOrigin of [
    '/orders/merchant',
    'http://merchant.example',
    'javascript:alert(1)',
    'https://user:password@merchant.example',
    'https://merchant.example/another-path',
    'https://merchant.example/?redirect=external',
    'https://merchant.example/#fragment',
  ]) {
    await assert.rejects(sendRestaurantPush(messaging, input, { webAppOrigin }), /HTTPS origin/);
  }
  assert.equal(sendCalls, 0);
});
