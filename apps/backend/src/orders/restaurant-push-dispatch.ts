import type { RestaurantPushMessage } from './restaurant-push-sender';

export interface PlatformOrderNotification {
  eventType: 'order.created' | 'order.status_changed';
  referenceType: 'order';
  referenceId: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const v = value.trim();
  if (!v || v.length > max) throw new Error(`${field} is invalid.`);
  return v;
}

export function restaurantPushFromPlatformNotification(
  token: string,
  notification: PlatformOrderNotification,
): RestaurantPushMessage | undefined {
  if (notification.referenceType !== 'order') return undefined;
  if (notification.eventType !== 'order.created' && notification.eventType !== 'order.status_changed') return undefined;
  if (!notification.metadata || notification.metadata.vertical !== 'food') return undefined;

  const status = text(notification.metadata.status, 'status', 64);
  return {
    token: text(token, 'token', 4096),
    title: text(notification.title, 'title', 120),
    body: text(notification.body, 'body', 500),
    orderId: text(notification.referenceId, 'orderId', 100),
    status,
  };
}
