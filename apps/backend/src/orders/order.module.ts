import { Module } from "@nestjs/common";
import { BusinessProfilesModule } from "../business-profiles/business-profiles.module";
import { IdentityModule } from "../identity/identity.module";
import { NotificationModule } from "../notifications/notification.module";
import { OrderController } from "./order.controller";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";

@Module({
  imports: [IdentityModule, BusinessProfilesModule, NotificationModule],
  controllers: [OrderController],
  providers: [OrderRepository, OrderService],
})
export class OrderModule {}
