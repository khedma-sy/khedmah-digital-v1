import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabasePool } from "../database/database.pool";
import type { FoodPromotion } from "./food-promotion.types";

const FOOD_CATEGORIES = ["restaurant", "cafe", "bakery", "sweets", "catering", "juice_icecream"] as const;

interface FoodPromotionRow extends Record<string, unknown> {
  id: string;
  code: string;
  name_ar: string;
  merchant_business_id: string;
  created_by_user_id: string;
  discount_type: "percentage" | "fixed";
  percentage_off: number | null;
  fixed_amount: string | null;
  currency: "SYP" | "USD";
  minimum_subtotal: string;
  maximum_discount: string | null;
  active: boolean;
  valid_from: Date;
  valid_until: Date;
  max_redemptions: number | null;
  per_user_limit: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFoodPromotionRecord {
  readonly businessId: string;
  readonly code: string;
  readonly nameAr: string;
  readonly discountType: "percentage" | "fixed";
  readonly percentageOff?: number;
  readonly fixedAmount?: number;
  readonly currency: "SYP" | "USD";
  readonly minimumSubtotal: number;
  readonly maximumDiscount?: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly maxRedemptions?: number;
  readonly perUserLimit: number;
}

@Injectable()
export class FoodPromotionRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async create(ownerUserId: string, input: CreateFoodPromotionRecord): Promise<FoodPromotion> {
    return this.db.transaction(async (client) => {
      const business = await client.query<{ id: string }>(
        `SELECT id FROM business_profiles
         WHERE id=$1 AND owner_user_id=$2 AND category_code=ANY($3::text[])
           AND visibility='public' AND moderation_status='approved'
           AND trust_status='approved' AND status='active'
         FOR UPDATE`,
        [input.businessId, ownerUserId, FOOD_CATEGORIES],
      );
      if (!business.rows[0]) throw new ForbiddenException("Food promotion access denied.");
      try {
        const result = await client.query<FoodPromotionRow>(
          `INSERT INTO food_promo_codes(
             id,code,name_ar,merchant_business_id,created_by_user_id,discount_type,
             percentage_off,fixed_amount,currency,minimum_subtotal,maximum_discount,
             valid_from,valid_until,max_redemptions,per_user_limit
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING *`,
          [
            randomUUID(), input.code, input.nameAr, input.businessId, ownerUserId,
            input.discountType, input.percentageOff ?? null, input.fixedAmount ?? null,
            input.currency, input.minimumSubtotal, input.maximumDiscount ?? null,
            input.validFrom, input.validUntil, input.maxRedemptions ?? null, input.perUserLimit,
          ],
        );
        return mapPromotion(result.rows[0]!);
      } catch (error) {
        if (isPostgresError(error, "23505"))
          throw new ConflictException("Promotion code is already in use.");
        throw error;
      }
    });
  }

  async listOwned(ownerUserId: string, businessId: string): Promise<FoodPromotion[]> {
    const owner = await this.db.query<{ id: string }>(
      `SELECT id FROM business_profiles
       WHERE id=$1 AND owner_user_id=$2 AND category_code=ANY($3::text[])`,
      [businessId, ownerUserId, FOOD_CATEGORIES],
    );
    if (!owner[0]) throw new ForbiddenException("Food promotion access denied.");
    const rows = await this.db.query<FoodPromotionRow>(
      `SELECT p.* FROM food_promo_codes p
       JOIN business_profiles b ON b.id=p.merchant_business_id
       WHERE p.merchant_business_id=$1 AND b.owner_user_id=$2
       ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,
      [businessId, ownerUserId],
    );
    return rows.map(mapPromotion);
  }

  async setActive(ownerUserId: string, id: string, active: boolean, expectedUpdatedAt: string): Promise<FoodPromotion> {
    return this.db.transaction(async (client) => {
      const reference = await client.query<{ merchant_business_id: string }>(
        `SELECT merchant_business_id FROM food_promo_codes WHERE id=$1`,
        [id],
      );
      if (!reference.rows[0]) throw new NotFoundException("Food promotion was not found.");
      const business = await client.query<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM business_profiles WHERE id=$1 FOR KEY SHARE`,
        [reference.rows[0].merchant_business_id],
      );
      if (business.rows[0]?.owner_user_id !== ownerUserId)
        throw new ForbiddenException("Food promotion access denied.");
      const found = await client.query<FoodPromotionRow>(
        `SELECT * FROM food_promo_codes
         WHERE id=$1 AND merchant_business_id=$2 FOR UPDATE`,
        [id, reference.rows[0].merchant_business_id],
      );
      const promotion = found.rows[0];
      if (!promotion) throw new NotFoundException("Food promotion was not found.");
      if (promotion.updated_at.toISOString() !== expectedUpdatedAt)
        throw new ConflictException("Food promotion changed; refresh and retry.");
      if (active && promotion.valid_until <= new Date())
        throw new ConflictException("Expired promotion cannot be activated.");
      const updated = await client.query<FoodPromotionRow>(
        `UPDATE food_promo_codes SET active=$2,updated_at=NOW()
         WHERE id=$1 AND updated_at=$3 RETURNING *`,
        [id, active, promotion.updated_at],
      );
      if (!updated.rows[0])
        throw new ConflictException("Food promotion changed; refresh and retry.");
      return mapPromotion(updated.rows[0]);
    });
  }
}

function isPostgresError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: string }).code === code;
}

function mapPromotion(row: FoodPromotionRow): FoodPromotion {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.name_ar,
    merchantBusinessId: row.merchant_business_id,
    createdByUserId: row.created_by_user_id,
    discountType: row.discount_type,
    percentageOff: row.percentage_off ?? undefined,
    fixedAmount: row.fixed_amount === null ? undefined : Number(row.fixed_amount),
    currency: row.currency,
    minimumSubtotal: Number(row.minimum_subtotal),
    maximumDiscount: row.maximum_discount === null ? undefined : Number(row.maximum_discount),
    active: row.active,
    validFrom: row.valid_from.toISOString(),
    validUntil: row.valid_until.toISOString(),
    maxRedemptions: row.max_redemptions ?? undefined,
    perUserLimit: row.per_user_limit,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
