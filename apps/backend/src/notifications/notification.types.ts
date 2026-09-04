export type PlatformNotificationEvent =
  | 'order.created'
  | 'order.status_changed'
  | 'mobility.created'
  | 'mobility.status_changed';

export type PlatformNotificationReference = 'order' | 'mobility';

export interface PlatformNotification {
  id: string;
  eventType: PlatformNotificationEvent;
  referenceType: PlatformNotificationReference;
  referenceId: string;
  title: string;
  body: string;
  metadata: Record<string, string>;
  readAt?: string;
  createdAt: string;
}

export interface PublishNotification {
  userId: string;
  eventKey: string;
  eventType: PlatformNotificationEvent;
  referenceType: PlatformNotificationReference;
  referenceId: string;
  title: string;
  body: string;
  metadata?: Record<string, string>;
}
