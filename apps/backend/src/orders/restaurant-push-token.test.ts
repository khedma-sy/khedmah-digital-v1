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

test('restaurant push token registration rejects whitespace and control characters before persistence', () => {
  const valid = { token: 'fcm-token-value-1234567890', deviceId: 'web-device_01' };
  for (const token of [
    ' fcm-token-value-1234567890',
    'fcm-token-value-1234567890 ',
    'fcm-token-value-12345 67890',
    'fcm-token-value-12345\n67890',
    'fcm-token-value-12345\t67890',
    'fcm-token-value-12345\u000067890',
    'fcm-token-value-12345\u007f67890',\n    'fcm-token-value-12345\u200b67890',\n    'fcm-token-value-12345\u202e67890',\n    'fcm-token-value-12345\u00e967890',
  ]) {
    assert.throws(() => validateRestaurantPushTokenRegistration({ ...valid, token }), /token is invalid/);
  }
});
