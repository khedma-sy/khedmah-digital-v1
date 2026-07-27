import { IdentityRepository } from '../identity/identity.repository';
import { PlatformLogger } from '../logging/platform-logger';
import { AnalyticsRepository } from './analytics.repository';
import { PublicAnalyticsEventReceipt } from './analytics.types';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';
export declare class AnalyticsService {
    private readonly analytics;
    private readonly identityRepository;
    private readonly logger;
    constructor(analytics: AnalyticsRepository, identityRepository: IdentityRepository, logger: PlatformLogger);
    recordEvent(request: RecordAnalyticsEventRequest): PublicAnalyticsEventReceipt;
    private auditRecordedEvent;
    private logRecordedEvent;
}
