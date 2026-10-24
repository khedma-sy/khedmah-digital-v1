import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firebasePushInvalidationReason,
  invalidateRestaurantPushTokenForFirebaseError,
  registerRestaurantPushToken,
  restaurantPushTokenFingerprint,
} from './restaurant-push-token-lifecycle';

function memoryRepo() {
  const records = new Map();
  return {
    records,
    async findByUserAndDevice(userId, deviceId) { return records.get(`${userId}:${deviceId}`); },
    async upsert(record) { records.set(`${record.userId}:${record.deviceId}`, record); },
    async invalidate(userId, deviceId, reason, at) {
      const key = `${userId}:${deviceId}`, current = records.get(key);
      if (!current) return;
      records.set(key, { ...current, active:false, invalidatedAt:at, invalidationReason:reason, updatedAt:at });
    },
  };
}

test('restaurant push token registration upserts by user and device without exposing the token in the receipt', async () => {
  const repo = memoryRepo();
  const token = 'fcm-token-value-1234567890';
  const receipt = await registerRestaurantPushToken(repo, 'user-1', {
    token, deviceId:'web-device_01', platform:'web',
  }, new Date('2026-10-24T04:00:00Z'));
  assert.deepEqual(receipt, {
    deviceId:'web-device_01',
    tokenFingerprint:restaurantPushTokenFingerprint(token),
  });
  assert.equal('token' in receipt, false);
  const stored = repo.records.get('user-1:web-device_01');
  assert.equal(stored.active, true);
  assert.equal(stored.token, token);
  assert.equal(stored.createdAt, '2026-10-24T04:00:00.000Z');
});

test('re-registration preserves creation time and rotates the token', async () => {
  const repo = memoryRepo();
  await registerRestaurantPushToken(repo, 'user-1', {
    token:'fcm-token-value-1234567890', deviceId:'web-device_01',
  }, new Date('2026-10-24T04:00:00Z'));
  await registerRestaurantPushToken(repo, 'user-1', {
    token:'fcm-token-value-ABCDEFGHIJ', deviceId:'web-device_01',
  }, new Date('2026-10-24T05:00:00Z'));
  const stored = repo.records.get('user-1:web-device_01');
  assert.equal(stored.createdAt, '2026-10-24T04:00:00.000Z');
  assert.equal(stored.updatedAt, '2026-10-24T05:00:00.000Z');
  assert.equal(stored.token, 'fcm-token-value-ABCDEFGHIJ');
  assert.equal(stored.active, true);
});

test('only terminal Firebase token errors invalidate registration', async () => {
  const repo = memoryRepo();
  await registerRestaurantPushToken(repo, 'user-1', {
    token:'fcm-token-value-1234567890', deviceId:'web-device_01',
  }, new Date('2026-10-24T04:00:00Z'));
  assert.equal(firebasePushInvalidationReason({ code:'messaging/internal-error' }), undefined);
  assert.equal(await invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', { code:'messaging/internal-error' },
    new Date('2026-10-24T04:10:00Z'),
  ), false);
  assert.equal(repo.records.get('user-1:web-device_01').active, true);

  assert.equal(await invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', { code:'messaging/registration-token-not-registered' },
    new Date('2026-10-24T04:20:00Z'),
  ), true);
  const stored = repo.records.get('user-1:web-device_01');
  assert.equal(stored.active, false);
  assert.equal(stored.invalidationReason, 'registration-token-not-registered');
});
