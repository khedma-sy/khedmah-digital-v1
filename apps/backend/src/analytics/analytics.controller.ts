import { Body, Controller, Inject, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';

@Controller('analytics/events')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analyticsService: AnalyticsService) {}

  @Post()
  recordEvent(@Body() body: RecordAnalyticsEventRequest) {
    return { analyticsEvent: this.analyticsService.recordEvent(body) };
  }
}
