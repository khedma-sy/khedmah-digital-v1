export type BusinessProfileVisibility = 'public' | 'private';
export type BusinessProfileTrustStatus = 'pending' | 'approved' | 'suspended';
export type BusinessProfileStatus = 'active' | 'suspended';

export interface BusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly ownerUserId: string;
  readonly organizationId?: string;
  readonly visibility: BusinessProfileVisibility;
  readonly trustStatus: BusinessProfileTrustStatus;
  readonly status: BusinessProfileStatus;
  readonly phone?: string;
  readonly email?: string;
  readonly website?: string;
  readonly categoryCode: string;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicBusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly ownerUserId: string;
  readonly visibility: BusinessProfileVisibility;
  readonly trustStatus: BusinessProfileTrustStatus;
  readonly status: BusinessProfileStatus;
  readonly phone?: string;
  readonly email?: string;
  readonly website?: string;
  readonly categoryCode: string;
  readonly cityCode: string;
  readonly countryCode: string;
}
