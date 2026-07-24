import { LifecycleStatus, Visibility } from '../../../shared/common-types.mjs';

export const ProfileConcept = Object.freeze({
  PROFILE: 'Profile',
  PROFILE_IDENTITY: 'Profile Identity',
  PROFILE_TYPE: 'Profile Type',
  PROFILE_VISIBILITY: 'Profile Visibility',
  PROFILE_OWNERSHIP_REFERENCE: 'Profile Ownership Reference',
  PROFILE_STATUS: 'Profile Status',
});

export const ProfileType = Object.freeze({
  PERSONAL: 'personal_profile',
  PROFESSIONAL: 'professional_profile',
  BUSINESS: 'business_profile',
  ORGANIZATION: 'organization_profile',
  PARTNER: 'partner_profile',
  REPRESENTATIVE: 'representative_profile',
});

export const ProfileVisibility = Object.freeze({
  PUBLIC: Visibility.PUBLIC,
  PRIVATE: Visibility.PRIVATE,
  INTERNAL: Visibility.INTERNAL,
});

export const ProfileStatus = Object.freeze({
  CREATED: LifecycleStatus.CREATED,
  PENDING: LifecycleStatus.PENDING,
  ACTIVE: LifecycleStatus.ACTIVE,
  SUSPENDED: LifecycleStatus.SUSPENDED,
  ARCHIVED: LifecycleStatus.ARCHIVED,
});

export const REQUIRED_PROFILE_FIELDS = Object.freeze(['profileIdentityRef', 'profileType', 'visibility', 'status', 'ownershipRef']);
export const PROFILE_IDENTITY_REFERENCE_PATTERN = /^profile_identity:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const USER_ACCOUNT_REFERENCE_PATTERN = /^user_account:[a-z0-9][a-z0-9._:-]{2,127}$/i;
