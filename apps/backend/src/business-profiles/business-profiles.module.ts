import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { BusinessProfilesController } from './business-profiles.controller';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';

@Module({
  imports: [IdentityModule],
  controllers: [BusinessProfilesController],
  providers: [BusinessProfileRepository, BusinessProfileService],
  exports: [BusinessProfileRepository]
})
export class BusinessProfilesModule {}
