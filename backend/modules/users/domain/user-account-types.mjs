import { AccountStatus, AccountType, LifecycleState, OWNERSHIP_BOUNDARY_REFERENCES } from '../../identity/domain/identity-types.mjs';
import { Visibility } from '../../../shared/common-types.mjs';

export const UserAccountConcept = Object.freeze({
  USER_ACCOUNT: 'User Account',
  USER_IDENTITY_REFERENCE: 'User Identity Reference',
  ACCOUNT_TYPE_REFERENCE: 'Account Type Reference',
  ACCOUNT_LIFECYCLE_REFERENCE: 'Account Lifecycle Reference',
  ACCOUNT_STATUS: 'Account Status',
  VISIBILITY_CLASSIFICATION: 'Visibility Classification',
});

export const UserAccountType = AccountType;
export const UserAccountStatus = AccountStatus;
export const UserLifecycleState = LifecycleState;

export const UserVisibilityClassification = Object.freeze({
  PUBLIC: Visibility.PUBLIC,
  PRIVATE: Visibility.PRIVATE,
  INTERNAL: Visibility.INTERNAL,
});

export const REQUIRED_USER_ACCOUNT_FIELDS = Object.freeze([
  'userIdentifier',
  'identityReference',
  'accountType',
  'accountStatus',
  'lifecycleState',
  'visibility',
]);

export const USER_SAFE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/i;
export const USER_IDENTITY_REFERENCE_PATTERN = /^identity_[a-z0-9][a-z0-9_-]{7,127}$/i;

export const USER_ROLE_PERMISSION_REFERENCES = OWNERSHIP_BOUNDARY_REFERENCES;
