import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { ContactModule } from './contact/contact.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
import { PlatformLogger } from './logging/platform-logger';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [IdentityModule, OrganizationsModule, ContactModule, AnalyticsModule],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger]
})
export class AppModule {}
