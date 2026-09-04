export type ProductAvailability = 'in_stock' | 'out_of_stock' | 'made_to_order';
export type ProductStatus = 'draft' | 'active' | 'inactive';
export type ProductModerationStatus = 'pending' | 'approved' | 'rejected';
export type ProductSort = 'newest' | 'price_asc' | 'price_desc';

export interface PublicProductFilters {
  readonly q?: string;
  readonly categoryCode?: string;
  readonly cityCode?: string;
  readonly businessProfileId?: string;
  readonly availability?: ProductAvailability;
  readonly currency?: 'SYP' | 'USD';
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly sort: ProductSort;
}

export interface ProductListing {
  readonly id: string;
  readonly businessProfileId: string;
  readonly ownerUserId: string;
  readonly titleAr: string;
  readonly descriptionAr?: string;
  readonly price: number;
  readonly currency: 'SYP' | 'USD';
  readonly categoryCode: string;
  readonly availability: ProductAvailability;
  readonly requiresPrescription: boolean;
  readonly controlledItem: boolean;
  readonly status: ProductStatus;
  readonly moderationStatus: ProductModerationStatus;
  readonly rejectionReason?: string;
  readonly imageUrl?: string;
  readonly imageUrls?: string[];
  readonly businessName?: string;
  readonly cityCode?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublicProductListing = Omit<ProductListing, 'ownerUserId' | 'rejectionReason'>;
