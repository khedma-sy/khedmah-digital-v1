import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { PlatformLogger } from '../logging/platform-logger';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsEventRecord, PublicAnalyticsEventReceipt } from './analytics.types';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';
import { validateRecordAnalyticsEvent } from './analytics.validation';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly logger: PlatformLogger
  ) {}

  recordEvent(request: RecordAnalyticsEventRequest): PublicAnalyticsEventReceipt {
    const input = validateRecordAnalyticsEvent(request);
    const requestContext = getRequestContext();
    const event: AnalyticsEventRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    };

    this.analytics.saveEvent(event);
    this.auditRecordedEvent();
    this.logRecordedEvent(event);

    return {
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      recordedAt: event.createdAt
    };
  }

  private auditRecordedEvent(): void {
    const requestContext = getRequestContext();
    this.identityRepository.appendAuditLog('analytics.event.recorded', {
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    });
  }

  private logRecordedEvent(event: AnalyticsEventRecord): void {
    this.logger.log({
      timestamp: new Date().toISOString(),
      event: 'analytics_event_recorded',
      eventType: event.eventType,
      entityType: event.entityType
    });
  }
}
