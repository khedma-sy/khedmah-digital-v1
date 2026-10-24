import type { PlatformNotification } from './notification.types';

export interface PushDeliveryEnvelope {
  token: string;
  title: string;
  body: string;
  referenceId: string;
  eventType: PlatformNotification['eventType'];
  data: Readonly<Record<string, string>>;
}

const allowedMetadataKeys = new Set(['status','vertical','fromStatus']);

function safe(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} is invalid.`);
  return text;
}

/**
 * Converts an in-app notification into the minimal payload allowed to leave the backend.
 * Unknown metadata keys are dropped, never forwarded.
 */
export function platformNotificationToPush(
  tokenValue: unknown,
  notification: PlatformNotification,
): PushDeliveryEnvelope {
  const token = safe(tokenValue, 'token', 4096);
  const data: Record<string,string> = {};
  for (const [key,value] of Object.entries(notification.metadata ?? {})) {
    if (!allowedMetadataKeys.has(key) || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.length <= 100) data[key] = trimmed;
  }
  return {
    token,
    title: safe(notification.title, 'title', 120),
    body: safe(notification.body, 'body', 500),
    referenceId: safe(notification.referenceId, 'referenceId', 100),
    eventType: notification.eventType,
    data,
  };
}
