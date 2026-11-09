import { createHash } from 'node:crypto';
import { validateRestaurantPushTokenRegistration } from './restaurant-push-token';

export interface RestaurantPushTokenRecord {
  userId: string;
  deviceId: string;
  token: string;
  tokenFingerprint: string;
  platform: 'web';
  active: boolean;
  createdAt: string;
  updatedAt: string;
  invalidatedAt?: string;
  invalidationReason?: string;
}

export interface RestaurantPushTokenRepositoryPort {
  upsert(record: RestaurantPushTokenRecord): Promise<void>;
  findByUserAndDevice(userId: string, deviceId: string): Promise<RestaurantPushTokenRecord | undefined>;
  /** Atomic compare-and-invalidate: never disable a rotated token for the same device. */
  invalidate(userId: string, deviceId: string, expectedTokenFingerprint: string, reason: string, at: string): Promise<boolean>;
}

function safeIdentity(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const text = value.trim();
  if (!text || text.length > 200) throw new Error(`${field} is invalid.`);
  return text;
}

export function restaurantPushTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function registerRestaurantPushToken(
  repo: RestaurantPushTokenRepositoryPort,
  userIdValue: unknown,
  input: unknown,
  now = new Date(),
): Promise<{ deviceId: string; tokenFingerprint: string }> {
  const userId = safeIdentity(userIdValue, 'userId');
  const registration = validateRestaurantPushTokenRegistration(input);
  const at = now.toISOString();
  const previous = await repo.findByUserAndDevice(userId, registration.deviceId);
  const tokenFingerprint = restaurantPushTokenFingerprint(registration.token);
  await repo.upsert({
    userId,
    deviceId: registration.deviceId,
    token: registration.token,
    tokenFingerprint,
    platform: 'web',
    active: true,
    createdAt: previous?.createdAt ?? at,
    updatedAt: at,
  });
  return { deviceId: registration.deviceId, tokenFingerprint };
}

export function firebasePushInvalidationReason(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  if (code === 'messaging/registration-token-not-registered') return 'registration-token-not-registered';
  if (code === 'messaging/invalid-registration-token') return 'invalid-registration-token';
  return undefined;
}

export async function invalidateRestaurantPushTokenForFirebaseError(
  repo: RestaurantPushTokenRepositoryPort,
  userIdValue: unknown,
  deviceIdValue: unknown,
  expectedTokenFingerprintValue: unknown,
  error: unknown,
  now = new Date(),
): Promise<boolean> {
  const reason = firebasePushInvalidationReason(error);
  if (!reason) return false;
  const userId = safeIdentity(userIdValue, 'userId');
  const deviceId = safeIdentity(deviceIdValue, 'deviceId');
  if (typeof expectedTokenFingerprintValue !== 'string' || !/^[a-f0-9]{64}$/.test(expectedTokenFingerprintValue)) {
    throw new Error('tokenFingerprint is invalid.');
  }
  // Repository implementations MUST match the fingerprint and active state
  // atomically (e.g. one conditional UPDATE). A read-then-write is unsafe.
  return repo.invalidate(userId, deviceId, expectedTokenFingerprintValue, reason, now.toISOString());
}
