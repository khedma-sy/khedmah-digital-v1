import { AnalyticsEntityType, AnalyticsEventMetadata, AnalyticsEventType } from './analytics.types';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';
export declare function validateRecordAnalyticsEvent(request: RecordAnalyticsEventRequest): {
    eventType: AnalyticsEventType;
    entityType: AnalyticsEntityType;
    entityId: string;
    occurredAt: string;
    anonymousId: string | undefined;
    sessionReference: string | undefined;
    metadata: AnalyticsEventMetadata;
};
