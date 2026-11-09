import assert from 'node:assert/strict';
import test from 'node:test';
import { restaurantPushFromPlatformNotification } from './restaurant-push-dispatch';
import { sendRestaurantPush } from './restaurant-push-sender';

test('dispatch cannot normalize malformed device tokens into sendable tokens', async () => {
  let sends = 0;
  const messaging = { async send() { sends += 1; return 'message-test'; } };
  const notification = {
    eventType: 'order.created' as const,
    referenceType: 'order' as const,
    referenceId: 'order-123',
    title: 'طلب جديد',
    body: 'راجع الطلب.',
    metadata: { status: 'placed', vertical: 'food' },
  };
  for (const token of [
    ' fcm-token-value-1234567890',
    'fcm-token-value-1234567890 ',
    '\tfcm-token-value-1234567890\n',
    'fcm-token-value-12345 67890',
    'short',
  ]) {
    await assert.rejects(async () => {
      const message = restaurantPushFromPlatformNotification(token, notification);
      assert.ok(message);
      await sendRestaurantPush(messaging, message);
    }, /token is invalid/);
  }
  assert.equal(sends, 0);
});

test('food platform notification becomes a safe restaurant push message', () => {
  assert.deepEqual(restaurantPushFromPlatformNotification(
    'fcm-token-value-1234567890',
    {
      eventType:'order.created',
      referenceType:'order',
      referenceId:'order-123',
      title:'طلب جديد',
      body:'تم إنشاء الطلب.',
      metadata:{ status:'placed', vertical:'food' },
    },
  ), {
    token:'fcm-token-value-1234567890',
    title:'طلب جديد',
    body:'تم إنشاء الطلب.',
    orderId:'order-123',
    status:'placed',
  });
});

test('non-food notifications are ignored rather than pushed', () => {
  assert.equal(restaurantPushFromPlatformNotification(
    'fcm-token-value-1234567890',
    {
      eventType:'order.status_changed',
      referenceType:'order',
      referenceId:'order-123',
      title:'تم التسعير',
      body:'تم تحديث الطلب.',
      metadata:{ status:'quoted', vertical:'grocery' },
    },
  ), undefined);
});

test('restaurant push mapping rejects malformed food metadata', () => {
  assert.throws(() => restaurantPushFromPlatformNotification(
    'fcm-token-value-1234567890',
    {
      eventType:'order.status_changed',
      referenceType:'order',
      referenceId:'order-123',
      title:'تم التسعير',
      body:'تم تحديث الطلب.',
      metadata:{ vertical:'food' },
    },
  ), /status/);
});
