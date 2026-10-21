import type { ServiceListing } from '../service-catalog/service-catalog.types';

export type ProfessionalAvailability = 'available' | 'busy' | 'unavailable';

export interface ProfessionalProfile {
  readonly id: string;
  readonly userId: string;
  readonly headlineAr: string;
  readonly headlineEn?: string;
  readonly bioAr?: string;
  readonly bioEn?: string;
  readonly availability: ProfessionalAvailability;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly skills: readonly string[];
  readonly isFeatured: boolean;
  readonly featuredAt?: string;
  readonly revision?: string;
  readonly contentRevision?: string;
  readonly reviewImageUrls?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicProfessionalProfile {
  readonly id: string;
  readonly headlineAr: string;
  readonly headlineEn?: string;
  readonly bioAr?: string;
  readonly bioEn?: string;
  readonly availability: ProfessionalAvailability;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly skills: readonly string[];
  readonly isFeatured: boolean;
  readonly revision?: string;
  readonly contentRevision?: string;
  readonly reviewImageUrls?: readonly string[];
  readonly createdAt: string;
  readonly contactEligibility?: {
    readonly visibility: 'public' | 'private' | 'internal';
    readonly moderationStatus: 'approved' | 'pending' | 'rejected' | 'suspended';
    readonly lifecycleStatus: 'created' | 'pending' | 'active' | 'suspended' | 'archived';
    readonly eligible: boolean;
  };
}

/** Reviewer-only aggregate. It must never be added by the public profile mapper. */
export interface ProfessionalProfileReviewSnapshot {
  /** Exact parent revision that must be sent back as expectedRevision. */
  readonly exactRevision: string;
  readonly reviewImageUrls: readonly string[];
  readonly serviceListings: readonly ServiceListing[];
}

export interface ProfessionalProfileModerationRecord extends ProfessionalProfile {
  readonly reviewSnapshot: ProfessionalProfileReviewSnapshot;
}

export interface PublicProfessionalProfileModerationReview extends PublicProfessionalProfile {
  readonly reviewSnapshot: ProfessionalProfileReviewSnapshot;
}

export interface MediaAsset {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly assetType: 'profile_image' | 'gallery';
  readonly url: string;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface VerificationRequest {
  readonly id: string;
  readonly entityType: 'professional';
  readonly entityId: string;
  readonly requesterId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly notes?: string;
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
