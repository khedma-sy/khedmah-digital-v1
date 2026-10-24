export interface RestaurantPushTokenRegistration {
  token: string;
  deviceId: string;
  platform: 'web';
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new Error(`${field} is invalid.`);
  return trimmed;
}

/**
 * Validates the browser/FCM registration payload only.
 * Persistence and sending remain separate authorities.
 */
export function validateRestaurantPushTokenRegistration(value: unknown): RestaurantPushTokenRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Push registration is invalid.');
  const input = value as Record<string, unknown>;
  const token = text(input.token, 'token', 20, 4096);
  const deviceId = text(input.deviceId, 'deviceId', 8, 200);
  if (!/^[A-Za-z0-9:_\-.]+$/.test(deviceId)) throw new Error('deviceId is invalid.');
  if (input.platform !== undefined && input.platform !== 'web') throw new Error('platform is invalid.');
  return { token, deviceId, platform: 'web' };
}
