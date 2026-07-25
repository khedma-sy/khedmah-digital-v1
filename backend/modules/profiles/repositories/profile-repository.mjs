import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { ProfileErrorCode, createProfileError } from '../domain/errors.mjs';
import { canTransitionProfileLifecycle } from '../domain/lifecycle.mjs';
import { ProfileStatus, ProfileType, ProfileVisibility } from '../domain/profile-types.mjs';

export const ProfileTable = Object.freeze({
  name: 'profiles',
  primaryKey: 'profile_identifier',
  uniqueOwnerReference: 'user_identifier',
  ownerTable: 'core_user_accounts',
  ownerDeletion: 'RESTRICT',
  visibilityIsAuthorization: false,
  storesPasswords: false,
  storesCredentials: false,
  storesTokens: false,
  storesSessions: false,
  storesPrivateContacts: false,
  storesFinancialData: false,
});

export const ProfileColumn = Object.freeze({
  PROFILE_IDENTIFIER: 'profile_identifier',
  USER_IDENTIFIER: 'user_identifier',
  PROFILE_TYPE: 'profile_type',
  DISPLAY_NAME: 'display_name',
  LIFECYCLE_STATUS: 'lifecycle_status',
  VISIBILITY: 'visibility',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  ARCHIVED_AT: 'archived_at',
});

const PROFILE_IDENTIFIER_PATTERN = /^profile_[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const USER_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const profileTypes = Object.freeze(Object.values(ProfileType));
const lifecycleStatuses = Object.freeze(Object.values(ProfileStatus));
const visibilities = Object.freeze(Object.values(ProfileVisibility));

function validateDisplayName(value) {
  const valid = typeof value === 'string'
    && value === value.trim()
    && value.length >= 1
    && value.length <= 120
    && !/[\u0000-\u001F\u007F]/u.test(value);
  return Object.freeze({
    valid,
    errors: Object.freeze(valid ? [] : [{ field: 'displayName', code: ProfileErrorCode.PROFILE_INVALID, message: 'Display name must be safe text between 1 and 120 characters.' }]),
  });
}

export function validateProfilePersistenceRecord(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, ['profileIdentifier', 'userIdentifier', 'profileType', 'displayName', 'lifecycleStatus', 'visibility']),
    validatePattern('profileIdentifier', value.profileIdentifier, PROFILE_IDENTIFIER_PATTERN, 'Profile identifier has an invalid format.'),
    validatePattern('userIdentifier', value.userIdentifier, USER_IDENTIFIER_PATTERN, 'User reference has an invalid format.'),
    validateAllowedValue('profileType', value.profileType, profileTypes),
    validateDisplayName(value.displayName),
    validateAllowedValue('lifecycleStatus', value.lifecycleStatus, lifecycleStatuses),
    validateAllowedValue('visibility', value.visibility, visibilities),
  );
}

export function assertUniqueProfileOwnership(records = []) {
  const profileIdentifiers = new Set();
  const userIdentifiers = new Set();
  const duplicates = [];
  for (const record of records) {
    if (record?.profileIdentifier && profileIdentifiers.has(record.profileIdentifier)) duplicates.push({ field: 'profileIdentifier', value: record.profileIdentifier });
    if (record?.userIdentifier && userIdentifiers.has(record.userIdentifier)) duplicates.push({ field: 'userIdentifier', value: record.userIdentifier });
    if (record?.profileIdentifier) profileIdentifiers.add(record.profileIdentifier);
    if (record?.userIdentifier) userIdentifiers.add(record.userIdentifier);
  }
  return Object.freeze({ valid: duplicates.length === 0, duplicates: Object.freeze(duplicates.map((duplicate) => Object.freeze(duplicate))) });
}

export function validateProfilePersistenceLifecycleTransition(from, to) {
  const valid = canTransitionProfileLifecycle(from, to);
  return Object.freeze({
    valid,
    errors: Object.freeze(valid ? [] : [{ field: 'lifecycleStatus', code: ProfileErrorCode.PROFILE_LIFECYCLE_INVALID, message: 'Profile lifecycle transition is not allowed.' }]),
  });
}

export function createProfileRepository({ databaseClient } = {}) {
  return Object.freeze({
    table: ProfileTable,
    hasDatabaseClient: Boolean(databaseClient),
    exposesHttpLogic: false,
    implementsAuthentication: false,
    implementsBusinessWorkflow: false,
    validate: validateProfilePersistenceRecord,
    findByIdentifier(profileIdentifier) {
      return databaseClient?.findProfileByIdentifier?.(profileIdentifier);
    },
    findByUserIdentifier(userIdentifier) {
      return databaseClient?.findProfileByUserIdentifier?.(userIdentifier);
    },
    createInvalidError() {
      return createProfileError(ProfileErrorCode.PROFILE_INVALID, 'Profile data is invalid.');
    },
    createDuplicateError() {
      return createProfileError(ProfileErrorCode.PROFILE_DUPLICATE, 'Profile ownership already exists.');
    },
    createUserReferenceError() {
      return createProfileError(ProfileErrorCode.PROFILE_USER_REFERENCE_INVALID, 'Profile user reference is invalid.');
    },
    createLifecycleError() {
      return createProfileError(ProfileErrorCode.PROFILE_LIFECYCLE_INVALID, 'Profile lifecycle is invalid.');
    },
    createVisibilityError() {
      return createProfileError(ProfileErrorCode.PROFILE_VISIBILITY_INVALID, 'Profile visibility is invalid.');
    },
  });
}

export const APPROVED_PROFILE_PERSISTENCE_TYPES = profileTypes;
export const APPROVED_PROFILE_PERSISTENCE_LIFECYCLES = lifecycleStatuses;
export const APPROVED_PROFILE_PERSISTENCE_VISIBILITIES = visibilities;
