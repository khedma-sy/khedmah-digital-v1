import assert from 'node:assert/strict';
import test from 'node:test';
import { platformNotificationToPush } from './notification-push-policy';

test('push policy forwards only allowlisted notification metadata', () => {
  const envelope = platformNotificationToPush('fcm-token-value-1234567890', {
    id:'n1',
    eventType:'order.created',
    referenceType:'order',
    referenceId:'order-1',
    title:'طلب جديد',
    body:'تم إنشاء الطلب.',
    metadata:{
      status:'placed',
      vertical:'food',
      fromStatus:'',
      customerPhone:'+963000000000',
      deliveryAddress:'private address',
      latitude:'33.5',
    },
    createdAt:'2026-10-24T04:00:00.000Z',
  });
  assert.deepEqual(envelope.data, { status:'placed', vertical:'food' });
  assert.doesNotMatch(JSON.stringify(envelope), /customerPhone|deliveryAddress|latitude|private address/);
});

test('push policy rejects invalid token and oversized visible text', () => {
  const base = {
    id:'n1',
    eventType:'order.status_changed',
    referenceType:'order',
    referenceId:'order-1',
    title:'حالة الطلب',
    body:'تم تحديث الطلب.',
    metadata:{ status:'quoted', vertical:'food' },
    createdAt:'2026-10-24T04:00:00.000Z',
  };
  assert.throws(() => platformNotificationToPush('', base), /token/);
  assert.throws(() => platformNotificationToPush('fcm-token-value-1234567890', { ...base, title:'x'.repeat(121) }), /title/);
});
