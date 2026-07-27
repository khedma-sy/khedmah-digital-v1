import { AnalyticsService } from './analytics.service';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    recordEvent(body: RecordAnalyticsEventRequest): {
        analyticsEvent: import("./analytics.types").PublicAnalyticsEventReceipt;
    };
}
