export const FREE_PRODUCT_LIMIT_PER_USER = 3;

export interface AdvertisingPolicy {
  readonly phase: 'free_launch' | 'paid';
  readonly listingLimitPerUser: number;
  readonly paymentsEnabled: boolean;
  readonly pricingPublished: boolean;
  readonly checkoutEnabled: boolean;
  readonly paidPlansStatus: 'planned' | 'available';
}

export interface AdvertisingPackageBlueprint {
  readonly code: 'business_10' | 'business_30' | 'business_100' | 'sponsored_7';
  readonly kind: 'listing_bundle' | 'sponsored_add_on';
  readonly nameAr: string;
  readonly listingLimit: number | null;
  readonly durationDays: number;
  readonly price: null;
  readonly currency: null;
  readonly purchasable: false;
  readonly placement: 'organic' | 'clearly_labelled_sponsored';
  readonly featuresAr: readonly string[];
}

const PACKAGE_BLUEPRINTS: readonly AdvertisingPackageBlueprint[] = [
  { code: 'business_10', kind: 'listing_bundle', nameAr: 'أعمال 10', listingLimit: 10, durationDays: 30, price: null, currency: null, purchasable: false, placement: 'organic', featuresAr: ['10 إعلانات نشطة', 'إدارة الصور والحالة', 'إحصاءات مجمعة عند جاهزيتها'] },
  { code: 'business_30', kind: 'listing_bundle', nameAr: 'أعمال 30', listingLimit: 30, durationDays: 30, price: null, currency: null, purchasable: false, placement: 'organic', featuresAr: ['30 إعلانًا نشطًا', 'إدارة الصور والحالة', 'إحصاءات مجمعة عند جاهزيتها'] },
  { code: 'business_100', kind: 'listing_bundle', nameAr: 'أعمال 100', listingLimit: 100, durationDays: 30, price: null, currency: null, purchasable: false, placement: 'organic', featuresAr: ['100 إعلان نشط', 'إدارة الصور والحالة', 'إحصاءات مجمعة عند جاهزيتها'] },
  { code: 'sponsored_7', kind: 'sponsored_add_on', nameAr: 'ظهور ممول 7 أيام', listingLimit: null, durationDays: 7, price: null, currency: null, purchasable: false, placement: 'clearly_labelled_sponsored', featuresAr: ['موضع منفصل بعلامة إعلان ممول', 'لا يغيّر ترتيب النتائج العضوية', 'لا يغيّر الثقة أو التقييم'] }
];

export function plannedAdvertisingPackages(): readonly AdvertisingPackageBlueprint[] { return PACKAGE_BLUEPRINTS; }

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
