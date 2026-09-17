import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { AiAdminController } from './ai-admin.controller';
import { AiAdminRepository } from './ai-admin.repository';
import { AiAdminService } from './ai-admin.service';

@Module({
  imports: [IdentityModule, OperationsProductModule],
  controllers: [AiAdminController],
  providers: [AiAdminRepository, AiAdminService],
  exports: [AiAdminService]
})
export class AiAdminModule {}
