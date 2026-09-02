export type BusinessProfileVisibility = 'public' | 'private';
export type BusinessProfileTrustStatus = 'pending' | 'approved' | 'suspended';
export type BusinessProfileModerationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BusinessProfileStatus = 'active' | 'suspended';

export interface BusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly ownerUserId: string;
  readonly organizationId?: string;
  readonly visibility: BusinessProfileVisibility;
  readonly moderationStatus: BusinessProfileModerationStatus;
  readonly trustStatus: BusinessProfileTrustStatus;
  readonly status: BusinessProfileStatus;
  readonly phone?: string;
  readonly email?: string;
  readonly website?: string;
  readonly categoryCode: string;
  readonly categoryNameAr?: string;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly addressAr?: string;
  readonly isFeatured: boolean;
  readonly serviceRadius?: number;
  readonly availability?: 'available' | 'busy' | 'unavailable';
  readonly rating?: number;
  readonly ratingCount?: number;
  readonly responseSpeedMinutes?: number;
  readonly featuredAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicBusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly visibility: BusinessProfileVisibility;
  readonly moderationStatus: BusinessProfileModerationStatus;
  readonly trustStatus: BusinessProfileTrustStatus;
  readonly status: BusinessProfileStatus;
  readonly phone?: string;
  readonly email?: string;
  readonly website?: string;
  readonly categoryCode: string;
  readonly categoryNameAr?: string;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly addressAr?: string;
  readonly isFeatured: boolean;
  readonly serviceRadius?: number;
  readonly availability?: 'available' | 'busy' | 'unavailable';
  readonly rating?: number;
  readonly ratingCount?: number;
  readonly responseSpeedMinutes?: number;
  readonly distanceKm?: number;
  readonly matchScore?: number;
  readonly createdAt: string;
}

export interface MediaAsset {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly assetType: 'logo' | 'cover' | 'gallery' | 'profile_image' | 'service_image';
  readonly url: string;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface OpeningHours {
  readonly id: string;
  readonly businessProfileId: string;
  readonly dayOfWeek: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly isClosed: boolean;
}

export interface BusinessBranch {
  readonly id: string;
  readonly businessProfileId: string;
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly addressAr?: string;
  readonly phone?: string;
  readonly cityCode: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly isMain: boolean;
}

export interface BusinessSocialLink {
  readonly id: string;
  readonly businessProfileId: string;
  readonly platform: string;
  readonly url: string;
}

export interface VerificationRequest {
  readonly id: string;
  readonly entityType: 'business' | 'professional';
  readonly entityId: string;
  readonly requesterId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly notes?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrustHistoryEntry {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly oldStatus?: string;
  readonly newStatus: string;
  readonly changedBy?: string;
  readonly reason?: string;
  readonly createdAt: string;
}
