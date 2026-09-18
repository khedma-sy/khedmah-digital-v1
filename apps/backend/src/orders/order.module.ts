import { Module } from "@nestjs/common";
import { BusinessProfilesModule } from "../business-profiles/business-profiles.module";
import { IdentityModule } from "../identity/identity.module";
import { OrderController } from "./order.controller";
import { FoodPromotionController } from "./food-promotion.controller";
import { FoodPromotionRepository } from "./food-promotion.repository";
import { FoodPromotionService } from "./food-promotion.service";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";

@Module({
  imports: [IdentityModule, BusinessProfilesModule],
  controllers: [OrderController, FoodPromotionController],
  providers: [OrderRepository, OrderService, FoodPromotionRepository, FoodPromotionService],
})
export class OrderModule {}
