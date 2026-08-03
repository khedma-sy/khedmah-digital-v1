export type ServiceOwnerType = 'business' | 'professional';
export type ServicePriceCurrency = 'SYP' | 'USD' | 'EUR';
export type ServicePriceType = 'fixed' | 'hourly' | 'negotiable';
export type ServiceStatus = 'active' | 'inactive';

export interface ServiceListing {
  readonly id: string;
  readonly ownerType: ServiceOwnerType;
  readonly ownerId: string;
  readonly titleAr: string;
  readonly titleEn?: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly categoryCode: string;
  readonly price?: number;
  readonly priceCurrency?: ServicePriceCurrency;
  readonly priceType: ServicePriceType;
  readonly status: ServiceStatus;
  readonly isFeatured: boolean;
  readonly featuredAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicServiceListing {
  readonly id: string;
  readonly ownerType: ServiceOwnerType;
  readonly ownerId: string;
  readonly titleAr: string;
  readonly titleEn?: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly categoryCode: string;
  readonly price?: number;
  readonly priceCurrency?: ServicePriceCurrency;
  readonly priceType: ServicePriceType;
  readonly status: ServiceStatus;
  readonly isFeatured: boolean;
  readonly createdAt: string;
}
