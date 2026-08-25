import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { ProfessionalProfileService } from './professional-profile.service';
import { ProfessionalProfilesController } from './professional-profiles.controller';

@Module({
  imports: [IdentityModule, OperationsProductModule],
  controllers: [ProfessionalProfilesController],
  providers: [ProfessionalProfileRepository, ProfessionalProfileService],
  exports: [ProfessionalProfileRepository, ProfessionalProfileService]
})
export class ProfessionalProfilesModule {}
