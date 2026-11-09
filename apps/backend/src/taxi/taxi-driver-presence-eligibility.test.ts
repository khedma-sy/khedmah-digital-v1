import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTaxiDriverEligibleForLiveDiscovery,
  type TaxiDriverPresenceEvidence,
} from './taxi-driver-presence-eligibility';

const NOW = 1_800_000_000_000;
const valid: TaxiDriverPresenceEvidence = {
  actorId: 'user_123',
  driverId: 'driver_123',
  vehicleId: 'vehicle_123',
  zoneCode: 'damascus',
  requestedZoneCode: 'damascus',
  sessionValid: true,
  accountActive: true,
  publicBusinessEligible: true,
  driverApproved: true,
  vehicleApproved: true,
  zoneApproved: true,
  driverApprovalExpiresAtMs: NOW + 86_400_000,
  vehicleApprovalExpiresAtMs: NOW + 86_400_000,
  zoneApprovalExpiresAtMs: NOW + 86_400_000,
  onlineRequested: true,
  onlineRequestedAtMs: NOW - 60_000,
  locationConsentGranted: true,
  locationConsentExpiresAtMs: NOW + 20 * 60_000,
  leaseExpiresAtMs: NOW + 60_000,
  lastHeartbeatAtMs: NOW - 5_000,
  locationObservedAtMs: NOW - 8_000,
  latitude: 33.5138,
  longitude: 36.2765,
  locationAccuracyMeters: 23,
  hasActiveTrip: false,
};
const eligible = (patch: Partial<TaxiDriverPresenceEvidence> = {}, now = NOW) =>
  isTaxiDriverEligibleForLiveDiscovery({ ...valid, ...patch }, now);

test('driver online lease requires all server-owned evidence, never registration alone', () => {
  assert.equal(eligible(), true);
  assert.equal(isTaxiDriverEligibleForLiveDiscovery(undefined, NOW), false);
  assert.equal(isTaxiDriverEligibleForLiveDiscovery(null, NOW), false);
  assert.equal(eligible({}, NaN), false);
  assert.equal(eligible({}, -1), false);
  for (const key of [
    'sessionValid', 'accountActive', 'publicBusinessEligible',
    'driverApproved', 'vehicleApproved', 'zoneApproved', 'onlineRequested',
    'locationConsentGranted',
  ] as const) {
    assert.equal(eligible({ [key]: false }), false, key);
  }
  assert.equal(eligible({ hasActiveTrip: true }), false, 'busy drivers are not free');
  assert.equal(eligible({ hasActiveTrip: undefined as never }), false, 'unknown busy state fails closed');
});

test('driver, vehicle, zone and audience identity must be explicit and canonical', () => {
  for (const key of ['actorId', 'driverId', 'vehicleId', 'zoneCode', 'requestedZoneCode'] as const) {
    for (const bad of ['', ' has-space', 'bad id', 'id\nother', '<x>']) {
      assert.equal(eligible({ [key]: bad }), false, key + ': ' + bad);
    }
  }
  assert.equal(eligible({ requestedZoneCode: 'aleppo' }), false);
  assert.equal(eligible({ zoneCode: 'Damascus' }), false);
});

test('approval, online, consent and lease expiration are all fail-closed', () => {
  for (const key of [
    'driverApprovalExpiresAtMs', 'vehicleApprovalExpiresAtMs',
    'zoneApprovalExpiresAtMs', 'locationConsentExpiresAtMs',
    'leaseExpiresAtMs',
  ] as const) {
    assert.equal(eligible({ [key]: NOW }), false, key + ' expired');
    assert.equal(eligible({ [key]: NaN }), false, key + ' not finite');
    assert.equal(eligible({ [key]: undefined as never }), false, key + ' absent');
  }
  assert.equal(eligible({ leaseExpiresAtMs: NOW + 90_001 }), false);
  assert.equal(eligible({ leaseExpiresAtMs: NOW + 90_000 }), true);
  assert.equal(eligible({}, NOW + 60_001), false, 'past lease cannot survive time advancement');
});

test('presence heartbeat, consented location and online intent expire', () => {
  assert.equal(eligible({ lastHeartbeatAtMs: NOW - 30_001 }), false);
  assert.equal(eligible({ lastHeartbeatAtMs: NOW - 30_000 }), true);
  assert.equal(eligible({ locationObservedAtMs: NOW - 30_001 }), false);
  assert.equal(eligible({ locationObservedAtMs: NOW + 5_001 }), false);
  assert.equal(eligible({ lastHeartbeatAtMs: NOW + 5_001 }), false);
  assert.equal(eligible({ onlineRequestedAtMs: NOW - 8 * 60 * 60 * 1000 - 1 }), false);
  assert.equal(eligible({ onlineRequestedAtMs: NOW + 5_001 }), false);
  assert.equal(eligible({ onlineRequestedAtMs: NOW - 8 * 60 * 60 * 1000 }), true);
});

test('coordinates and accuracy must be valid; missing or spoofed points never qualify', () => {
  const cases: Partial<TaxiDriverPresenceEvidence>[] = [
    { latitude: 91 }, { latitude: -91 }, { longitude: 181 }, { longitude: -181 },
    { latitude: Number.NaN }, { longitude: Number.POSITIVE_INFINITY },
    { latitude: undefined as never }, { longitude: null as never },
    { locationAccuracyMeters: 0 }, { locationAccuracyMeters: -1 },
    { locationAccuracyMeters: 100.1 }, { locationAccuracyMeters: NaN },
  ];
  for (const patch of cases) assert.equal(eligible(patch), false, JSON.stringify(patch));
  assert.equal(eligible({ latitude: -90, longitude: 180, locationAccuracyMeters: 100 }), true);
});

test('published business listing never implies an online driver by itself', () => {
  assert.equal(eligible({
    publicBusinessEligible: true,
    onlineRequested: false,
    lastHeartbeatAtMs: NOW - 10 * 60_000,
  }), false);
});
