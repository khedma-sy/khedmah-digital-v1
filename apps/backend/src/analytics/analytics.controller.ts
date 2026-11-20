import { Body, Controller, Inject, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';
import { AllowAnonymousMutation } from '../identity/security/session-auth.guard';

@Controller('analytics/events')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analyticsService: AnalyticsService) {}

  @Post()
  @AllowAnonymousMutation()
  async recordEvent(@Body() body: RecordAnalyticsEventRequest) {
    return { analyticsEvent: await this.analyticsService.recordEvent(body) };
  }
}
