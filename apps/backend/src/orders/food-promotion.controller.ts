import { Body, Controller, Get, Header, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { FoodPromotionService } from "./food-promotion.service";

@Controller("food-promotions")
export class FoodPromotionController {
  constructor(@Inject(FoodPromotionService) private readonly promotions: FoodPromotionService) {}

  @Post()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  create(@Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return this.promotions.create(cookie, body).then((promotion) => ({ promotion }));
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  list(@Headers("cookie") cookie: string | undefined, @Query("businessId") businessId: string) {
    return this.promotions.list(cookie, businessId).then((promotions) => ({ promotions }));
  }

  @Patch(":id/status")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  setActive(
    @Headers("cookie") cookie: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.promotions.setActive(cookie, id, body).then((promotion) => ({ promotion }));
  }
}
