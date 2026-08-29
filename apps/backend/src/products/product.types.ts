export type ProductAvailability = 'in_stock' | 'out_of_stock' | 'made_to_order';
export type ProductStatus = 'draft' | 'active' | 'inactive';
export type ProductModerationStatus = 'pending' | 'approved' | 'rejected';

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
