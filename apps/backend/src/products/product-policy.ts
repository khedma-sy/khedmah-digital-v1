export const FREE_PRODUCT_LIMIT_PER_USER = 3;

export interface AdvertisingPolicy {
  readonly phase: 'free_launch' | 'paid';
  readonly listingLimitPerUser: number;
  readonly paymentsEnabled: boolean;
  readonly pricingPublished: boolean;
  readonly checkoutEnabled: boolean;
  readonly paidPlansStatus: 'planned' | 'available';
}

function paidAdvertisingReady(): boolean {
  return process.env.PAID_ADVERTISING_ENABLED === 'true'
    && process.env.ADVERTISING_PRICING_PUBLISHED === 'true'
    && process.env.ADVERTISING_CHECKOUT_ENABLED === 'true';
}

export function advertisingPolicy(): AdvertisingPolicy {
  const paidReady = paidAdvertisingReady();
  const configured = Number.parseInt(process.env.PRODUCT_LISTING_LIMIT_PER_USER ?? '', 10);
  const configuredLimit = Number.isSafeInteger(configured) && configured > 0 && configured <= 1000
    ? configured
    : FREE_PRODUCT_LIMIT_PER_USER;
  return {
    phase: paidReady ? 'paid' : 'free_launch',
    listingLimitPerUser: paidReady ? configuredLimit : FREE_PRODUCT_LIMIT_PER_USER,
    paymentsEnabled: paidReady,
    pricingPublished: paidReady,
    checkoutEnabled: paidReady,
    paidPlansStatus: paidReady ? 'available' : 'planned'
  };
}

export function productLimitPerUser(): number { return advertisingPolicy().listingLimitPerUser; }
