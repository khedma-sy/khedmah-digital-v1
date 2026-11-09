import type { BusinessProfile } from '../business-profiles/business-profile.types';
import type { PublicUserProfile } from '../identity/identity.types';

type Merchant = Pick<BusinessProfile,
  'id' | 'ownerUserId' | 'categoryCode' | 'visibility' |
  'moderationStatus' | 'trustStatus' | 'status'>;
type Actor = Pick<PublicUserProfile, 'id' | 'status'>;

const FOOD_CATEGORIES = new Set([
  'restaurant', 'cafe', 'bakery', 'sweets', 'catering', 'juice_icecream',
]);

export class RestaurantPushMerchantAccessDenied extends Error {
  constructor() {
    super('Restaurant push merchant access denied.');
    this.name = 'RestaurantPushMerchantAccessDenied';
  }
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
    && value.trim() === value && !/[\s\x00-\x1f\x7f]/u.test(value);
}

/**
 * Pure, fail-closed PRECONDITION for future merchant push enrollment/dispatch.
 *
 * The actor MUST come from server-validated session identity; the merchant
 * MUST be loaded from the canonical business repository, never HTTP payload.
 * This preflight alone is NOT write authority. Any future token persistence
 * MUST enforce the same ownership/status constraints atomically in its database
 * transaction, preventing a profile transfer/suspension race.
 *
 * No endpoint or push sending is wired to this function.
 */
export function requireRestaurantPushMerchantEligibility(
  actor: Actor | null | undefined,
  merchant: Merchant | null | undefined,
  requestedBusinessId: unknown,
): { readonly userId: string; readonly businessId: string } {
  if (!actor || !safeIdentifier(actor.id) || actor.status !== 'active'
    || !safeIdentifier(requestedBusinessId) || !merchant
    || !safeIdentifier(merchant.id) || !safeIdentifier(merchant.ownerUserId)
    || merchant.id !== requestedBusinessId || merchant.ownerUserId !== actor.id
    || !FOOD_CATEGORIES.has(merchant.categoryCode)
    || merchant.visibility !== 'public'
    || merchant.moderationStatus !== 'approved'
    || merchant.trustStatus !== 'approved'
    || merchant.status !== 'active') {
    throw new RestaurantPushMerchantAccessDenied();
  }
  return { userId: actor.id, businessId: merchant.id };
}
