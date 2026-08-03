import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { ProfessionalProfileService } from './professional-profile.service';
import { ProfessionalProfilesController } from './professional-profiles.controller';

@Module({
  imports: [IdentityModule],
  controllers: [ProfessionalProfilesController],
  providers: [ProfessionalProfileRepository, ProfessionalProfileService],
  exports: [ProfessionalProfileRepository]
})
export class ProfessionalProfilesModule {}
