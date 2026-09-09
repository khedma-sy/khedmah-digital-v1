import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SessionTokenService } from '../identity/security/session-token.service';
import { TaxiAccessController } from './taxi-access.controller';
import { TaxiTripController } from './taxi-trip.controller';
import { TaxiTripService } from './taxi-trip.service';
import { TaxiAccessService } from './taxi-access.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TaxiAccessController, TaxiTripController],
  providers: [TaxiAccessService, SessionTokenService, TaxiTripService],
  exports: [TaxiAccessService]
})
export class TaxiModule {}
