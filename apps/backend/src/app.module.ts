import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { BusinessProfilesModule } from './business-profiles/business-profiles.module';
import { CategoryModule } from './categories/category.module';
import { AdModule } from './classifieds/ad.module';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
import { KoraAdminModule } from './kora-admin/kora-admin.module';
import { LocationsModule } from './locations/locations.module';
import { MediaModule } from './media/media.module';
import { ModerationModule } from './moderation/moderation.module';
import { PlatformLogger } from './logging/platform-logger';
import { OrganizationsModule } from './organizations/organizations.module';
import { OperationsProductModule } from './operations-product/operations-product.module';
import { ProfessionalProfilesModule } from './professional-profiles/professional-profiles.module';
import { SearchModule } from './search/search.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { ReportsModule } from './reports/reports.module';
import { ProductModule } from './products/product.module';
import { TaxiModule } from './taxi/taxi.module';

@Module({
  imports: [
    DatabaseModule,
    CategoryModule,
    IdentityModule,
    OrganizationsModule,
    ContactModule,
    AnalyticsModule,
    OperationsProductModule,
    KoraAdminModule,
    BusinessProfilesModule,
    ProfessionalProfilesModule,
    ServiceCatalogModule,
    LocationsModule,
    SearchModule,
    MediaModule,
    ModerationModule,
    ReportsModule,
    ProductModule,
    TaxiModule,
    AdModule
  ],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger]
})
export class AppModule {}
