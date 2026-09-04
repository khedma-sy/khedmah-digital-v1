import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { BusinessProfilesModule } from './business-profiles/business-profiles.module';
import { CategoryModule } from './categories/category.module';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
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
import { MobilityModule } from './mobility/mobility.module';
import { OrderModule } from './orders/order.module';
import { ProfessionalServiceModule } from './professional-services/professional-service.module';
import { PromotionModule } from './promotions/promotion.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [
    DatabaseModule,
    CategoryModule,
    IdentityModule,
    OrganizationsModule,
    ContactModule,
    AnalyticsModule,
    OperationsProductModule,
    BusinessProfilesModule,
    ProfessionalProfilesModule,
    ServiceCatalogModule,
    LocationsModule,
    SearchModule,
    MediaModule,
    ModerationModule,
    ReportsModule,
    ProductModule,
    MobilityModule,
    OrderModule,
    ProfessionalServiceModule,
    PromotionModule,
    NotificationModule
  ],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger]
})
export class AppModule {}
