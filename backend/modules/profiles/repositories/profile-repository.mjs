import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { createDatabaseError, DatabaseErrorCode } from '../../../database/errors/database-errors.mjs';
import { ProfileErrorCode, createProfileError } from '../domain/errors.mjs';
import { canTransitionProfileLifecycle } from '../domain/lifecycle.mjs';
import { ProfileStatus, ProfileType, ProfileVisibility } from '../domain/profile-types.mjs';

const PERSISTED_PROFILE_FIELDS = Object.freeze([
  'profileIdentifier',
  'userIdentifier',
  'profileType',
  'visibility',
  'lifecycleStatus',
]);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export const ProfileTable = Object.freeze({
  name: 'profiles',
  primaryKey: 'profile_identifier',
  uniqueUserReference: 'user_identifier',
  userReferenceTable: 'core_user_accounts',
  storesPrivateProfileData: false,
  storesPasswords: false,
  storesTokens: false,
  storesSecrets: false,
  storesCredentials: false,
  createsSpecializedProfileEntities: false,
});

export const ProfileColumn = Object.freeze({
  PROFILE_IDENTIFIER: 'profile_identifier',
  USER_IDENTIFIER: 'user_identifier',
  PROFILE_TYPE: 'profile_type',
  VISIBILITY: 'visibility',
  LIFECYCLE_STATUS: 'lifecycle_status',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  ARCHIVED_AT: 'archived_at',
});

export function validateProfilePersistenceRecord(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, PERSISTED_PROFILE_FIELDS),
    validatePattern('profileIdentifier', value.profileIdentifier, IDENTIFIER_PATTERN),
    validatePattern('userIdentifier', value.userIdentifier, IDENTIFIER_PATTERN),
    validateAllowedValue('profileType', value.profileType, Object.values(ProfileType)),
    validateAllowedValue('visibility', value.visibility, Object.values(ProfileVisibility)),
    validateAllowedValue('lifecycleStatus', value.lifecycleStatus, Object.values(ProfileStatus)),
  );
}

export function assertUniqueProfileOwnership(records = []) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    if (!record?.userIdentifier) continue;
    if (seen.has(record.userIdentifier)) duplicates.push(record.userIdentifier);
    seen.add(record.userIdentifier);
  }
  return Object.freeze({ valid: duplicates.length === 0, duplicates: Object.freeze(duplicates) });
}

export function validateProfilePersistenceLifecycleTransition(from, to) {
  const valid = canTransitionProfileLifecycle(from, to);
  const errors = valid ? [] : [{ field: 'lifecycleStatus', code: ProfileErrorCode.PROFILE_LIFECYCLE_INVALID, message: 'Profile lifecycle transition is not allowed.' }];
  return Object.freeze({ valid, errors: Object.freeze(errors) });
}

export function createProfileRepository({ databaseClient } = {}) {
  return Object.freeze({
    table: ProfileTable,
    hasDatabaseClient: Boolean(databaseClient),
    exposesApiLogic: false,
    implementsAuthentication: false,
    implementsBusinessLogic: false,
    createsSpecializedProfiles: false,
    validate: validateProfilePersistenceRecord,
    createDuplicateError(userIdentifier) {
      return createProfileError(ProfileErrorCode.PROFILE_DUPLICATE, 'A profile already exists for this user reference.', { userIdentifier });
    },
    createUserReferenceError(userIdentifier) {
      return createProfileError(ProfileErrorCode.PROFILE_USER_REFERENCE_INVALID, 'Profile user reference is invalid.', { userIdentifier });
    },
    createVisibilityError(visibility) {
      return createProfileError(ProfileErrorCode.PROFILE_VISIBILITY_INVALID, 'Profile visibility is invalid.', { visibility });
    },
    createDatabaseValidationError(metadata = {}) {
      return createDatabaseError(DatabaseErrorCode.DATABASE_VALIDATION_ERROR, 'Profile database validation failed.', metadata);
    },
  });
}
