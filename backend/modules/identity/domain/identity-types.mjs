import { LifecycleStatus } from '../../../shared/common-types.mjs';

export const AccountType = Object.freeze({
  INDIVIDUAL_USER: 'individual_user',
  PROFESSIONAL_ACCOUNT: 'professional_account',
  BUSINESS_ACCOUNT: 'business_account',
  ORGANIZATION_ACCOUNT: 'organization_account',
  PARTNER_ACCOUNT: 'partner_account',
});

export const AccountStatus = Object.freeze({
  CREATED: LifecycleStatus.CREATED,
  PENDING: LifecycleStatus.PENDING,
  ACTIVE: LifecycleStatus.ACTIVE,
  SUSPENDED: LifecycleStatus.SUSPENDED,
  ARCHIVED: LifecycleStatus.ARCHIVED,
});

export const LifecycleState = AccountStatus;

export const IdentityConcept = Object.freeze({
  USER_ACCOUNT: 'User Account',
  PROFILE_IDENTITY: 'Profile Identity',
  ACCOUNT_TYPE: 'Account Type',
  ACCOUNT_STATUS: 'Account Status',
  LIFECYCLE_STATE: 'Lifecycle State',
});

export const REQUIRED_IDENTITY_FIELDS = Object.freeze(['identifier', 'accountType', 'status', 'lifecycleState']);
export const IDENTITY_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._+-]{2,127}$/i;

export const OWNERSHIP_BOUNDARY_REFERENCES = Object.freeze([
  'roles_reference_only',
  'permissions_reference_only',
  'ownership_boundaries_reference_only',
]);
