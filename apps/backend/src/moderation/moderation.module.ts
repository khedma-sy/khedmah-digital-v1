import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { ProfessionalProfilesModule } from '../professional-profiles/professional-profiles.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { IdentityModule } from '../identity/identity.module';
import { ModerationController } from './moderation.controller';
import { VerificationReviewService } from './verification-review.service';

@Module({
  imports: [
    BusinessProfilesModule,
    ProfessionalProfilesModule,
    OperationsProductModule,
    IdentityModule
  ],
  controllers: [ModerationController],
  providers: [VerificationReviewService]
})
export class ModerationModule {}
