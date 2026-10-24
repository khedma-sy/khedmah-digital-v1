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
  invalidate(userId: string, deviceId: string, reason: string, at: string): Promise<void>;
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
  error: unknown,
  now = new Date(),
): Promise<boolean> {
  const reason = firebasePushInvalidationReason(error);
  if (!reason) return false;
  const userId = safeIdentity(userIdValue, 'userId');
  const deviceId = safeIdentity(deviceIdValue, 'deviceId');
  await repo.invalidate(userId, deviceId, reason, now.toISOString());
  return true;
}
