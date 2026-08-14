import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { CategoryModule } from '../categories/category.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { BusinessProfilesController } from './business-profiles.controller';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';

@Module({
  imports: [IdentityModule, OperationsProductModule, CategoryModule],
  controllers: [BusinessProfilesController],
  providers: [BusinessProfileRepository, BusinessProfileService],
  exports: [BusinessProfileRepository]
})
export class BusinessProfilesModule {}
