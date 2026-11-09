/**
 * Source-only eligibility contract for a future server-owned Taxi presence lease.
 * NOT connected to routes, database writes, dispatch, geolocation, or feature flags.
 *
 * All evidence MUST originate from the authenticated, authorization-checked
 * server transaction, never from public business availability or a client body.
 * The caller must revalidate under a lock before any state transition/assignment.
 */
export interface TaxiDriverPresenceEvidence {
  readonly actorId: string;
  readonly driverId: string;
  readonly vehicleId: string;
  readonly zoneCode: string;
  readonly requestedZoneCode: string;
  readonly sessionValid: boolean;
  readonly accountActive: boolean;
  readonly publicBusinessEligible: boolean;
  readonly driverApproved: boolean;
  readonly vehicleApproved: boolean;
  readonly zoneApproved: boolean;
  readonly driverApprovalExpiresAtMs: number;
  readonly vehicleApprovalExpiresAtMs: number;
  readonly zoneApprovalExpiresAtMs: number;
  readonly onlineRequested: boolean;
  readonly onlineRequestedAtMs: number;
  readonly locationConsentGranted: boolean;
  readonly locationConsentExpiresAtMs: number;
  readonly leaseExpiresAtMs: number;
  readonly lastHeartbeatAtMs: number;
  readonly locationObservedAtMs: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly locationAccuracyMeters: number;
  readonly hasActiveTrip: boolean;
}

const HEARTBEAT_MAX_AGE_MS = 30_000;
const LOCATION_MAX_AGE_MS = 30_000;
const LEASE_MAX_AHEAD_MS = 90_000;
const ONLINE_INTENT_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const CLOCK_FUTURE_TOLERANCE_MS = 5_000;
const MAX_ACCURACY_METERS = 100;

function safeId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
}
function safeTime(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}
function activeUntil(v: unknown, nowMs: number): boolean {
  return safeTime(v) && v > nowMs;
}
function recent(v: unknown, nowMs: number, maxAgeMs: number): boolean {
  return safeTime(v) && v >= nowMs - maxAgeMs && v <= nowMs + CLOCK_FUTURE_TOLERANCE_MS;
}

/**
 * A boolean eligibility decision only: NEVER return a precise location,
 * identity, device token, or approval document in a public search response.
 * Does not establish distance, dispatch capacity or live connectivity.
 */
export function isTaxiDriverEligibleForLiveDiscovery(
  evidence: TaxiDriverPresenceEvidence | null | undefined,
  nowMs: number,
): boolean {
  if (!evidence || !safeTime(nowMs)) return false;
  if (!safeId(evidence.actorId) || !safeId(evidence.driverId) ||
      !safeId(evidence.vehicleId) || !safeId(evidence.zoneCode) ||
      !safeId(evidence.requestedZoneCode) ||
      evidence.zoneCode !== evidence.requestedZoneCode) return false;

  if (evidence.sessionValid !== true || evidence.accountActive !== true ||
      evidence.publicBusinessEligible !== true ||
      evidence.driverApproved !== true || evidence.vehicleApproved !== true ||
      evidence.zoneApproved !== true ||
      evidence.onlineRequested !== true || evidence.locationConsentGranted !== true ||
      evidence.hasActiveTrip !== false) return false;

  if (!activeUntil(evidence.driverApprovalExpiresAtMs, nowMs) ||
      !activeUntil(evidence.vehicleApprovalExpiresAtMs, nowMs) ||
      !activeUntil(evidence.zoneApprovalExpiresAtMs, nowMs) ||
      !activeUntil(evidence.locationConsentExpiresAtMs, nowMs) ||
      !activeUntil(evidence.leaseExpiresAtMs, nowMs) ||
      evidence.leaseExpiresAtMs - nowMs > LEASE_MAX_AHEAD_MS) return false;

  if (!recent(evidence.onlineRequestedAtMs, nowMs, ONLINE_INTENT_MAX_AGE_MS) ||
      !recent(evidence.lastHeartbeatAtMs, nowMs, HEARTBEAT_MAX_AGE_MS) ||
      !recent(evidence.locationObservedAtMs, nowMs, LOCATION_MAX_AGE_MS)) return false;

  if (!Number.isFinite(evidence.latitude) || evidence.latitude < -90 ||
      evidence.latitude > 90 || !Number.isFinite(evidence.longitude) ||
      evidence.longitude < -180 || evidence.longitude > 180 ||
      !Number.isFinite(evidence.locationAccuracyMeters) ||
      evidence.locationAccuracyMeters <= 0 ||
      evidence.locationAccuracyMeters > MAX_ACCURACY_METERS) return false;

  return true;
}
