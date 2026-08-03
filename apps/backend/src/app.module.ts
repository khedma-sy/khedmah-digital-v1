import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { BusinessProfilesModule } from './business-profiles/business-profiles.module';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
import { LocationsModule } from './locations/locations.module';
import { PlatformLogger } from './logging/platform-logger';
import { OrganizationsModule } from './organizations/organizations.module';
import { OperationsProductModule } from './operations-product/operations-product.module';
import { ProfessionalProfilesModule } from './professional-profiles/professional-profiles.module';
import { SearchModule } from './search/search.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';

@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    OrganizationsModule,
    ContactModule,
    AnalyticsModule,
    OperationsProductModule,
    BusinessProfilesModule,
    ProfessionalProfilesModule,
    ServiceCatalogModule,
    LocationsModule,
    SearchModule
  ],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger]
})
export class AppModule {}
