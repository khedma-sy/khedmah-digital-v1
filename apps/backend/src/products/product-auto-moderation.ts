import type { BusinessProfile } from '../business-profiles/business-profile.types';
import type { ProductListing } from './product.types';

export type ProductAutoModerationReason =
  | 'seller_not_eligible'
  | 'category_not_active'
  | 'image_missing'
  | 'title_too_short'
  | 'description_too_short'
  | 'high_risk_content';

export interface ProductAutoModerationDecision {
  readonly approved: boolean;
  readonly reasons: readonly ProductAutoModerationReason[];
  readonly policyVersion: 'product-auto-v1';
}

const HIGH_RISK_TERMS = [
  /سلاح|أسلحة|ذخيرة|متفجرات|مخدرات|حشيش|كوكايين|هيروين|حبوب\s+ممنوعة/u,
  /weapon|ammunition|explosive|narcotic|cocaine|heroin|counterfeit/iu
];

export function evaluateProductAutoModeration(
  product: ProductListing,
  business: BusinessProfile | undefined,
  categoryIsActive: boolean,
  hasPublicImage: boolean
): ProductAutoModerationDecision {
  const reasons: ProductAutoModerationReason[] = [];
  if (!business || business.visibility !== 'public' || business.moderationStatus !== 'approved' || business.trustStatus !== 'approved' || business.status !== 'active') reasons.push('seller_not_eligible');
  if (!categoryIsActive) reasons.push('category_not_active');
  if (!hasPublicImage) reasons.push('image_missing');
  if (product.titleAr.trim().length < 5) reasons.push('title_too_short');
  if ((product.descriptionAr?.trim().length ?? 0) < 20) reasons.push('description_too_short');
  const searchableText = `${product.titleAr} ${product.descriptionAr ?? ''}`;
  if (HIGH_RISK_TERMS.some((pattern) => pattern.test(searchableText))) reasons.push('high_risk_content');
  return { approved: reasons.length === 0, reasons, policyVersion: 'product-auto-v1' };
}
