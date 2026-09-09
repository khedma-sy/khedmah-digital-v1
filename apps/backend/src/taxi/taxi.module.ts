import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SessionTokenService } from '../identity/security/session-token.service';
import { TaxiAccessController } from './taxi-access.controller';
import { TaxiAccessService } from './taxi-access.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TaxiAccessController],
  providers: [TaxiAccessService, SessionTokenService],
  exports: [TaxiAccessService]
})
export class TaxiModule {}
