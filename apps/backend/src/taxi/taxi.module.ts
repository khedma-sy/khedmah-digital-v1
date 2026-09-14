import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { SessionTokenService } from '../identity/security/session-token.service';
import { TaxiAccessController } from './taxi-access.controller';
import { TaxiPricingAdminController } from './taxi-pricing.controller';
import { TaxiPricingAdminService } from './taxi-pricing.service';
import { TaxiTripController } from './taxi-trip.controller';
import { TaxiTripService } from './taxi-trip.service';
import { TaxiAccessService } from './taxi-access.service';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [TaxiAccessController, TaxiTripController, TaxiPricingAdminController],
  providers: [TaxiAccessService, SessionTokenService, TaxiTripService, TaxiPricingAdminService],
  exports: [TaxiAccessService]
})
export class TaxiModule {}
