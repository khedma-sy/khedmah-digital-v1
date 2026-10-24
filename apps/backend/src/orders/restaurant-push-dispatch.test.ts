import assert from 'node:assert/strict';
import test from 'node:test';
import { restaurantPushFromPlatformNotification } from './restaurant-push-dispatch';

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
