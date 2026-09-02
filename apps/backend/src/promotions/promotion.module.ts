import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { AdminPromotionController,PromotionController } from './promotion.controller';
import { PromotionRepository } from './promotion.repository';
import { PromotionService } from './promotion.service';
@Module({imports:[IdentityModule,BusinessProfilesModule,OperationsProductModule],controllers:[PromotionController,AdminPromotionController],providers:[PromotionRepository,PromotionService]})
export class PromotionModule{}
