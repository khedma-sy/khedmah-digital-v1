import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { AdminAdController, AdController } from './ad.controller';
import { AdminAdMediaController, AdMediaController } from './ad-media.controller';
import { AdMediaService } from './ad-media.service';
import { AdRepository } from './ad.repository';
import { AdService } from './ad.service';

@Module({
  imports: [DatabaseModule, IdentityModule, OperationsProductModule],
  controllers: [AdController, AdminAdController, AdMediaController, AdminAdMediaController],
  providers: [AdRepository, AdService, AdMediaService],
  exports: [AdService]
})
export class AdModule {}
