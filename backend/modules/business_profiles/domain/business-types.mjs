import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const BusinessProfileConcept = Object.freeze({
  BUSINESS_PROFILE: 'Business Profile',
  BUSINESS_IDENTITY: 'Business Identity',
  BUSINESS_TYPE: 'Business Type',
  BUSINESS_STATUS: 'Business Status',
  BUSINESS_VISIBILITY: 'Business Visibility',
  BUSINESS_OWNERSHIP_REFERENCE: 'Business Ownership Reference',
});

export const BusinessType = Object.freeze({
  RESTAURANT: 'restaurant',
  SHOP: 'shop',
  WORKSHOP: 'workshop',
  SERVICE_BUSINESS: 'service_business',
  RETAIL_BUSINESS: 'retail_business',
  FACTORY: 'factory',
  SUPPLIER_BUSINESS: 'supplier_business',
  COMPANY: 'company',
});

export const BusinessVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const BusinessStatus = Object.freeze({
  CREATED: ProfileStatus.CREATED,
  PENDING: ProfileStatus.PENDING,
  ACTIVE: ProfileStatus.ACTIVE,
  SUSPENDED: ProfileStatus.SUSPENDED,
  ARCHIVED: ProfileStatus.ARCHIVED,
});

export const REQUIRED_BUSINESS_PROFILE_FIELDS = Object.freeze(['businessIdentityRef', 'profileRef', 'businessType', 'visibility', 'status', 'ownershipRef']);
export const BUSINESS_IDENTITY_REFERENCE_PATTERN = /^business_identity:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const PROFILE_REFERENCE_PATTERN = /^profile:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const USER_ACCOUNT_REFERENCE_PATTERN = /^user_account:[a-z0-9][a-z0-9._:-]{2,127}$/i;
