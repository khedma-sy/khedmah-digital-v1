import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { ProfessionalProfilesModule } from '../professional-profiles/professional-profiles.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { IdentityModule } from '../identity/identity.module';
import { ModerationController } from './moderation.controller';

@Module({
  imports: [
    BusinessProfilesModule,
    ProfessionalProfilesModule,
    OperationsProductModule,
    IdentityModule
  ],
  controllers: [ModerationController]
})
export class ModerationModule {}
