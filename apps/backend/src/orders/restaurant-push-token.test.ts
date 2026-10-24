import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRestaurantPushTokenRegistration } from './restaurant-push-token';

test('restaurant push token registration accepts bounded web tokens', () => {
  assert.deepEqual(validateRestaurantPushTokenRegistration({
    token: 'fcm-token-value-1234567890',
    deviceId: 'web-device_01',
    platform: 'web',
  }), {
    token: 'fcm-token-value-1234567890',
    deviceId: 'web-device_01',
    platform: 'web',
  });
});

test('restaurant push token registration rejects malformed or non-web payloads', () => {
  assert.throws(() => validateRestaurantPushTokenRegistration(null), /invalid/);
  assert.throws(() => validateRestaurantPushTokenRegistration({ token: 'short', deviceId: 'web-device_01' }), /token/);
  assert.throws(() => validateRestaurantPushTokenRegistration({ token: 'fcm-token-value-1234567890', deviceId: 'bad device' }), /deviceId/);
  assert.throws(() => validateRestaurantPushTokenRegistration({ token: 'fcm-token-value-1234567890', deviceId: 'web-device_01', platform: 'ios' }), /platform/);
});
