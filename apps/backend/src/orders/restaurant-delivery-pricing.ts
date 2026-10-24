import type { RestaurantDeliveryPricing } from './restaurant-delivery-quote';

export type RestaurantDeliveryCurrency = 'SYP' | 'USD';

function safeInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${field} is invalid.`);
  return number;
}

export function restaurantDeliveryPricingFromEnvironment(
  currency: RestaurantDeliveryCurrency,
  env: Record<string, string | undefined>,
): RestaurantDeliveryPricing {
  const raw = env.RESTAURANT_DELIVERY_PRICING_JSON?.trim();
  if (!raw) throw new Error('Restaurant delivery pricing is not configured.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Restaurant delivery pricing is invalid.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Restaurant delivery pricing is invalid.');
  const candidate = (parsed as Record<string, unknown>)[currency];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`Restaurant delivery pricing for ${currency} is not configured.`);
  }
  const value = candidate as Record<string, unknown>;
  const pricing = {
    baseFeeMinor: safeInteger(value.baseFeeMinor, 'baseFeeMinor'),
    perKmMinor: safeInteger(value.perKmMinor, 'perKmMinor'),
    minimumFeeMinor: safeInteger(value.minimumFeeMinor, 'minimumFeeMinor'),
    maximumFeeMinor: safeInteger(value.maximumFeeMinor, 'maximumFeeMinor'),
    pickupBufferMinutes: safeInteger(value.pickupBufferMinutes, 'pickupBufferMinutes'),
  };
  if (pricing.maximumFeeMinor < pricing.minimumFeeMinor) throw new Error('Restaurant delivery fee bounds are invalid.');
  return pricing;
}
