import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { OrderService } from "./order.service";

@Controller("orders")
export class OrderController {
  constructor(@Inject(OrderService) private readonly orders: OrderService) {}
  @Post() create(
    @Headers("cookie") cookie: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.orders.create(cookie, body, key).then((order) => ({ order }));
  }
  @Get("mine") mine(@Headers("cookie") cookie: string | undefined) {
    return this.orders.mine(cookie).then((orders) => ({ orders }));
  }
  @Get("merchant") merchant(
    @Headers("cookie") cookie: string | undefined,
    @Query("businessId") id: string,
  ) {
    return this.orders.merchant(cookie, id).then((orders) => ({ orders }));
  }
  @Get("courier") courier(
    @Headers("cookie") cookie: string | undefined,
    @Query("businessId") id: string,
  ) {
    return this.orders.courier(cookie, id).then((orders) => ({ orders }));
  }
  @Patch(":id/status") transition(
    @Headers("cookie") cookie: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.orders
      .transition(cookie, id, body)
      .then((order) => ({ order }));
  }
  @Post(":id/ratings") rate(
    @Headers("cookie") cookie: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.orders.rate(cookie, id, body).then(() => ({ rated: true }));
  }
  @Post(":id/location") location(
    @Headers("cookie") cookie: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.orders
      .location(cookie, id, body)
      .then(() => ({ recorded: true }));
  }
  @Get(":id/tracking") tracking(
    @Headers("cookie") cookie: string | undefined,
    @Param("id") id: string,
  ) {
    return this.orders.tracking(cookie, id);
  }
}
