import { Inject, Injectable } from "@nestjs/common";
import { IdentityService } from "../identity/identity.service";
import { readSessionToken } from "../identity/session-cookie";
import { FoodPromotionRepository } from "./food-promotion.repository";
import {
  validateCreateFoodPromotion,
  validateFoodPromotionStatus,
} from "./food-promotion.validation";

@Injectable()
export class FoodPromotionService {
  constructor(
    @Inject(FoodPromotionRepository) private readonly repo: FoodPromotionRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  private user(cookie: string | undefined) {
    return this.identity.getCurrentUser(readSessionToken(cookie));
  }

  async create(cookie: string | undefined, value: unknown) {
    const user = await this.user(cookie);
    return this.repo.create(user.id, validateCreateFoodPromotion(value));
  }

  async list(cookie: string | undefined, businessId: string) {
    const user = await this.user(cookie);
    return this.repo.listOwned(user.id, businessId);
  }

  async setActive(cookie: string | undefined, id: string, value: unknown) {
    const user = await this.user(cookie);
    const input = validateFoodPromotionStatus(value);
    return this.repo.setActive(user.id, id, input.active, input.expectedUpdatedAt);
  }
}
