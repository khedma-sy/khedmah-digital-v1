import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PlatformLogger } from '../logging/platform-logger';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [IdentityModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsService, PlatformLogger],
  exports: [AnalyticsRepository, AnalyticsService]
})
export class AnalyticsModule {}
