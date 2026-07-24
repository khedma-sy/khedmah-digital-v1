import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const OrganizationConcept = Object.freeze({
  ORGANIZATION: 'Organization',
  ORGANIZATION_IDENTITY: 'Organization Identity',
  ORGANIZATION_TYPE: 'Organization Type',
  ORGANIZATION_STATUS: 'Organization Status',
  ORGANIZATION_VISIBILITY: 'Organization Visibility',
  ORGANIZATION_OWNERSHIP_REFERENCE: 'Organization Ownership Reference',
  ORGANIZATION_MEMBERSHIP_REFERENCE: 'Organization Membership Reference',
});

export const OrganizationType = Object.freeze({
  COMPANY: 'company',
  FACTORY: 'factory',
  HOSPITAL: 'hospital',
  SCHOOL: 'school',
  INSTITUTION: 'institution',
  LARGE_ORGANIZATION: 'large_organization',
});

export const OrganizationVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const OrganizationStatus = Object.freeze({
  CREATED: ProfileStatus.CREATED,
  PENDING: ProfileStatus.PENDING,
  ACTIVE: ProfileStatus.ACTIVE,
  SUSPENDED: ProfileStatus.SUSPENDED,
  ARCHIVED: ProfileStatus.ARCHIVED,
});

export const REQUIRED_ORGANIZATION_FIELDS = Object.freeze(['organizationIdentityRef', 'profileRef', 'organizationType', 'visibility', 'status', 'ownershipRef', 'membershipRefs']);
export const ORGANIZATION_IDENTITY_REFERENCE_PATTERN = /^organization_identity:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const PROFILE_REFERENCE_PATTERN = /^profile:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const USER_ACCOUNT_REFERENCE_PATTERN = /^user_account:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const ORGANIZATION_MEMBER_REFERENCE_PATTERN = /^organization_member:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const ORGANIZATION_ROLE_REFERENCE_PATTERN = /^organization_role:[a-z0-9][a-z0-9._:-]{2,127}$/i;
