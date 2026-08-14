import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { CategoryModule } from '../categories/category.module';
import { IdentityModule } from '../identity/identity.module';
import { ProfessionalProfilesModule } from '../professional-profiles/professional-profiles.module';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';

@Module({
  imports: [IdentityModule, BusinessProfilesModule, ProfessionalProfilesModule, CategoryModule],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogRepository, ServiceCatalogService],
  exports: [ServiceCatalogRepository]
})
export class ServiceCatalogModule {}
