import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { MobilityController } from './mobility.controller';
import { MobilityDistanceService } from './mobility-distance.service';
import { MobilityRepository } from './mobility.repository';
import { MobilityService } from './mobility.service';

@Module({
  imports: [IdentityModule, BusinessProfilesModule, OperationsProductModule],
  controllers: [MobilityController],
  providers: [MobilityRepository, MobilityDistanceService, MobilityService]
})
export class MobilityModule {}
