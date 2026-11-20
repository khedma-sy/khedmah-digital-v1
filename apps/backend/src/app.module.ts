import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AnalyticsModule } from './analytics/analytics.module';
import { BillingModule } from './billing/billing.module';
import { BusinessProfilesModule } from './business-profiles/business-profiles.module';
import { CategoryModule } from './categories/category.module';
import { AdModule } from './classifieds/ad.module';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
import { SessionAuthGuard } from './identity/security/session-auth.guard';
import { KoraAdminModule } from './kora-admin/kora-admin.module';
import { LocationsModule } from './locations/locations.module';
import { MediaModule } from './media/media.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationModule } from './notifications/notification.module';
import { OrderModule } from './orders/order.module';
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
    BillingModule,
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
    AdModule,
    NotificationModule,
    OrderModule
  ],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger, { provide: APP_GUARD, useClass: SessionAuthGuard }]
})
export class AppModule {}
