export type AdKind = 'sale' | 'service' | 'wanted' | 'rent';
export type AdPriceMode = 'fixed' | 'negotiable' | 'contact' | 'none';
export type AdContactMode = 'profile' | 'phone' | 'whatsapp';
export type AdStatus = 'draft' | 'pending_review' | 'active' | 'inactive' | 'expired' | 'rejected';

export interface AdListing {
  readonly id: string;
  readonly ownerUserId: string;
  readonly businessProfileId?: string;
  readonly kind: AdKind;
  readonly titleAr: string;
  readonly descriptionAr?: string;
  readonly categoryCode: string;
  readonly priceMode: AdPriceMode;
  readonly priceMinor?: number;
  readonly currency?: 'SYP' | 'USD';
  readonly cityCode?: string;
  readonly areaText?: string;
  readonly contactMode: AdContactMode;
  readonly contactValue?: string;
  readonly status: AdStatus;
  readonly rejectionReason?: string;
  readonly imageUrls: readonly string[];
  readonly expiresAt?: string;
  readonly submittedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly contentRevision: number;
  readonly reviewRevision: number;
}

export type PublicAdListing = Omit<
  AdListing,
  'ownerUserId' | 'rejectionReason' | 'revision' | 'contentRevision' | 'reviewRevision'
>;

export interface AdContentInput {
  readonly businessProfileId?: string | null;
  readonly kind: AdKind;
  readonly titleAr: string;
  readonly descriptionAr?: string;
  readonly categoryCode: string;
  readonly priceMode: AdPriceMode;
  readonly priceMinor?: number;
  readonly currency?: 'SYP' | 'USD';
  readonly cityCode?: string;
  readonly areaText?: string;
  readonly contactMode: AdContactMode;
  readonly contactValue?: string;
  readonly expiresAt?: string;
}

export type AdContentPatch = Partial<AdContentInput>;
