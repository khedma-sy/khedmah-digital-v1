import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { PlatformLogger } from '../logging/platform-logger';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsEventRecord, PublicAnalyticsEventReceipt } from './analytics.types';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';
import { validateRecordAnalyticsEvent } from './analytics.validation';

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(AnalyticsRepository) private readonly analytics: AnalyticsRepository,
    @Inject(PlatformLogger) private readonly logger: PlatformLogger
  ) {}

  async recordEvent(request: RecordAnalyticsEventRequest): Promise<PublicAnalyticsEventReceipt> {
    const input = validateRecordAnalyticsEvent(request);
    const requestContext = getRequestContext();
    const event: AnalyticsEventRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    };

    await this.analytics.saveEvent(event);
    this.logRecordedEvent(event);

    return {
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      recordedAt: event.createdAt
    };
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
