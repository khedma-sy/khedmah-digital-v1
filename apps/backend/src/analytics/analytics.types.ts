export type AnalyticsEventType = 'business_view' | 'search_action' | 'contact_click' | 'inquiry_submitted';
export type AnalyticsEntityType = 'business_profile' | 'search';

export interface AnalyticsEventMetadata {
  readonly [key: string]: string | number | boolean;
}

export interface AnalyticsEventInput {
  readonly eventType: AnalyticsEventType;
  readonly entityType: AnalyticsEntityType;
  readonly entityId: string;
  readonly occurredAt: string;
  readonly anonymousId?: string;
  readonly sessionReference?: string;
  readonly metadata: AnalyticsEventMetadata;
}

export interface AnalyticsEventRecord extends AnalyticsEventInput {
  readonly id: string;
  readonly createdAt: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface PublicAnalyticsEventReceipt {
  readonly id: string;
  readonly eventType: AnalyticsEventType;
  readonly entityType: AnalyticsEntityType;
  readonly entityId: string;
  readonly recordedAt: string;
}
