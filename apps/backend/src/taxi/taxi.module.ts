import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { SessionTokenService } from '../identity/security/session-token.service';
import { TaxiAccessController } from './taxi-access.controller';
import { TaxiOperationalApprovalController } from './taxi-operational-approval.controller';
import { TaxiOperationalApprovalService } from './taxi-operational-approval.service';
import { TaxiPricingAdminController } from './taxi-pricing.controller';
import { TaxiPricingAdminService } from './taxi-pricing.service';
import { TaxiTripController } from './taxi-trip.controller';
import { TaxiTripService } from './taxi-trip.service';
import { TaxiAccessService } from './taxi-access.service';

@Module({
  imports: [DatabaseModule, IdentityModule, OperationsProductModule],
  controllers: [TaxiAccessController, TaxiTripController, TaxiPricingAdminController, TaxiOperationalApprovalController],
  providers: [TaxiAccessService, SessionTokenService, TaxiTripService, TaxiPricingAdminService, TaxiOperationalApprovalService],
  exports: [TaxiAccessService, TaxiOperationalApprovalService]
})
export class TaxiModule {}
