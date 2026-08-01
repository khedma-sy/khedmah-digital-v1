import { Body, Controller, Inject, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';

@Controller('analytics/events')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analyticsService: AnalyticsService) {}

  @Post()
  async recordEvent(@Body() body: RecordAnalyticsEventRequest) {
    return { analyticsEvent: await this.analyticsService.recordEvent(body) };
  }
}
