import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [BusinessProfilesModule, ServiceCatalogModule],
  controllers: [SearchController],
  providers: [SearchService]
})
export class SearchModule {}
