import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
import { PlatformLogger } from './logging/platform-logger';
import { OrganizationsModule } from './organizations/organizations.module';
import { OperationsProductModule } from './operations-product/operations-product.module';

@Module({
  imports: [DatabaseModule, IdentityModule, OrganizationsModule, ContactModule, AnalyticsModule, OperationsProductModule],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger]
})
export class AppModule {}
