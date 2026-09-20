export type FoodPromotionDiscountType = "percentage" | "fixed";

export interface FoodPromotion {
  readonly id: string;
  readonly code: string;
  readonly nameAr: string;
  readonly merchantBusinessId: string;
  readonly createdByUserId: string;
  readonly discountType: FoodPromotionDiscountType;
  readonly percentageOff?: number;
  readonly fixedAmount?: number;
  readonly currency: "SYP" | "USD";
  readonly minimumSubtotal: number;
  readonly maximumDiscount?: number;
  readonly active: boolean;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly maxRedemptions?: number;
  readonly perUserLimit: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FoodPromotionQuote {
  readonly code: string;
  readonly nameAr: string;
  readonly discountAmount: number;
}
