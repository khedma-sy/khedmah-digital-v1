export interface TrustedRestaurantRoute {
  distanceMeters: number;
  durationSeconds: number;
  verified: boolean;
  source: string;
  referenceId: string;
  expiresAt: number;
}

export interface RestaurantDeliveryPricing {
  baseFeeMinor: number;
  perKmMinor: number;
  minimumFeeMinor: number;
  maximumFeeMinor: number;
  pickupBufferMinutes: number;
}

export interface RestaurantDeliveryQuote {
  distanceMeters: number;
  etaMinutes: number;
  deliveryFeeMinor: number;
  routeReference: {
    source: string;
    id: string;
    expiresAt: number;
  };
}

function safeInteger(value: number, min: number, max: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${field} is invalid.`);
  return value;
}

/** Price restaurant delivery only from a trusted routing result. Never use straight-line distance as fare authority. */
export function quoteRestaurantDelivery(
  route: TrustedRestaurantRoute,
  pricing: RestaurantDeliveryPricing,
  now = Date.now(),
): RestaurantDeliveryQuote {
  if (!route || route.verified !== true || !route.source?.trim() || !route.referenceId?.trim()) {
    throw new Error('Trusted restaurant route is required.');
  }
  safeInteger(route.distanceMeters, 1, 500_000, 'distanceMeters');
  safeInteger(route.durationSeconds, 1, 86_400, 'durationSeconds');
  safeInteger(route.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'expiresAt');
  if (route.expiresAt <= now) throw new Error('Trusted restaurant route expired.');

  for (const [field, value] of Object.entries(pricing)) {
    safeInteger(value, 0, Number.MAX_SAFE_INTEGER, field);
  }
  if (pricing.maximumFeeMinor < pricing.minimumFeeMinor) throw new Error('Restaurant delivery fee bounds are invalid.');

  const distanceFee = Math.ceil(route.distanceMeters * pricing.perKmMinor / 1000);
  const raw = pricing.baseFeeMinor + distanceFee;
  const bounded = Math.max(pricing.minimumFeeMinor, Math.min(pricing.maximumFeeMinor, raw));
  const etaMinutes = Math.ceil(route.durationSeconds / 60) + pricing.pickupBufferMinutes;

  return {
    distanceMeters: route.distanceMeters,
    etaMinutes,
    deliveryFeeMinor: bounded,
    routeReference: { source: route.source.trim(), id: route.referenceId.trim(), expiresAt: route.expiresAt },
  };
}
