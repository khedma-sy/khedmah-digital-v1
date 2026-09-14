import { Module } from '@nestjs/common';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { KoraAdminController } from './kora-admin.controller';
import { KoraAdminRepository } from './kora-admin.repository';
import { KoraAdminService } from './kora-admin.service';

@Module({
  imports: [OperationsProductModule],
  controllers: [KoraAdminController],
  providers: [KoraAdminRepository, KoraAdminService],
  exports: [KoraAdminService]
})
export class KoraAdminModule {}
