import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { BusinessProfilesModule } from './business-profiles/business-profiles.module';
import { ContactModule } from './contact/contact.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from './identity/identity.module';
import { LocationsModule } from './locations/locations.module';
import { PlatformLogger } from './logging/platform-logger';
import { GlobalRateLimitMiddleware } from './middleware/global-rate-limit.middleware';
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(GlobalRateLimitMiddleware)
      .forRoutes(
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'contact/*path', method: RequestMethod.ALL },
        { path: 'search/*path', method: RequestMethod.ALL },
        { path: 'businesses', method: RequestMethod.GET },
        { path: 'businesses/*path', method: RequestMethod.GET },
        { path: 'professionals/search', method: RequestMethod.GET },
        { path: 'service-catalog/*path', method: RequestMethod.GET }
      );
  }
}
