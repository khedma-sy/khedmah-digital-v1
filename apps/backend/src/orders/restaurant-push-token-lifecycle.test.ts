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
    async invalidate(userId, deviceId, expectedTokenFingerprint, reason, at) {
      const key = `${userId}:${deviceId}`, current = records.get(key);
      if (!current || !current.active || current.tokenFingerprint !== expectedTokenFingerprint) return false;
      records.set(key, { ...current, active:false, invalidatedAt:at, invalidationReason:reason, updatedAt:at });
      return true;
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
    repo, 'user-1', 'web-device_01', restaurantPushTokenFingerprint('fcm-token-value-1234567890'), { code:'messaging/internal-error' },
    new Date('2026-10-24T04:10:00Z'),
  ), false);
  assert.equal(repo.records.get('user-1:web-device_01').active, true);

  assert.equal(await invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', restaurantPushTokenFingerprint('fcm-token-value-1234567890'), { code:'messaging/registration-token-not-registered' },
    new Date('2026-10-24T04:20:00Z'),
  ), true);
  const stored = repo.records.get('user-1:web-device_01');
  assert.equal(stored.active, false);
  assert.equal(stored.invalidationReason, 'registration-token-not-registered');
});

test('stale terminal FCM error cannot disable a newer token for the same device', async () => {
  const repo = memoryRepo();
  const oldToken = 'fcm-token-value-1234567890';
  const newToken = 'fcm-token-value-ABCDEFGHIJ';
  await registerRestaurantPushToken(repo, 'user-1', {
    token: oldToken, deviceId:'web-device_01',
  }, new Date('2026-10-24T04:00:00Z'));
  await registerRestaurantPushToken(repo, 'user-1', {
    token: newToken, deviceId:'web-device_01',
  }, new Date('2026-10-24T04:05:00Z'));

  assert.equal(await invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', restaurantPushTokenFingerprint(oldToken),
    { code:'messaging/registration-token-not-registered' },
    new Date('2026-10-24T04:10:00Z'),
  ), false);
  const saved = repo.records.get('user-1:web-device_01');
  assert.equal(saved.active, true);
  assert.equal(saved.token, newToken);
  assert.equal(saved.invalidationReason, undefined);

  assert.equal(await invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', restaurantPushTokenFingerprint(newToken),
    { code:'messaging/registration-token-not-registered' },
    new Date('2026-10-24T04:11:00Z'),
  ), true);
  assert.equal(repo.records.get('user-1:web-device_01').active, false);
  assert.equal(await invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', restaurantPushTokenFingerprint(newToken),
    { code:'messaging/registration-token-not-registered' },
    new Date('2026-10-24T04:12:00Z'),
  ), false);
});

test('terminal FCM invalidation rejects an invalid fingerprint without touching storage', async () => {
  let touched = false;
  const repo = {
    async upsert() { touched = true; },
    async findByUserAndDevice() { touched = true; return undefined; },
    async invalidate() { touched = true; return true; },
  };
  await assert.rejects(invalidateRestaurantPushTokenForFirebaseError(
    repo, 'user-1', 'web-device_01', 'not-a-sha256-fingerprint',
    { code:'messaging/registration-token-not-registered' },
  ), /tokenFingerprint is invalid/);
  assert.equal(touched, false);
});

test('invalid restaurant push tokens are rejected before any repository read or write', async () => {
  let called = false;
  const repo = {
    async findByUserAndDevice() { called = true; return undefined; },
    async upsert() { called = true; },
    async invalidate() { called = true; },
  };
  await assert.rejects(
    registerRestaurantPushToken(repo, 'user-1', {
      token: 'fcm-token-value-12345\n67890',
      deviceId: 'web-device_01',
      platform: 'web',
    }),
    /token is invalid/,
  );
  assert.equal(called, false);
});
