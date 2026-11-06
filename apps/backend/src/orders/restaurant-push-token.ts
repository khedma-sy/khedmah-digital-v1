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

/** Reject malformed FCM tokens consistently at registration and send boundaries. */
export function validateRestaurantPushToken(value: unknown): string {
  const token = text(value, 'token', 20, 4096);
  if (value !== token || /[\s\x00-\x1f\x7f]/u.test(token)) throw new Error('token is invalid.');
  return token;
}

/** Validates only the registration payload; persistence and sending remain separate authorities. */
export function validateRestaurantPushTokenRegistration(value: unknown): RestaurantPushTokenRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Push registration is invalid.');
  const input = value as Record<string, unknown>;
  const token = validateRestaurantPushToken(input.token);
  const deviceId = text(input.deviceId, 'deviceId', 8, 200);
  if (!/^[A-Za-z0-9:_\-.]+$/.test(deviceId)) throw new Error('deviceId is invalid.');
  if (input.platform !== undefined && input.platform !== 'web') throw new Error('platform is invalid.');
  return { token, deviceId, platform: 'web' };
}
