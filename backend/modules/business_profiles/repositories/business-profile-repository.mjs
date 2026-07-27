import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { createDatabaseError, DatabaseErrorCode } from '../../../database/errors/database-errors.mjs';
import { ProfileType } from '../../profiles/domain/profile-types.mjs';
import { BusinessProfileErrorCode, createBusinessProfileError } from '../domain/errors.mjs';
import { BusinessStatus, BusinessType, BusinessVisibility } from '../domain/business-types.mjs';
import { canTransitionBusinessLifecycle } from '../domain/lifecycle.mjs';

const REQUIRED_FIELDS = Object.freeze(['businessProfileIdentifier', 'profileIdentifier', 'businessType', 'businessStatus', 'visibility', 'lifecycleStatus']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export const BusinessProfileTable = Object.freeze({
  name: 'business_profiles',
  primaryKey: 'business_profile_identifier',
  uniqueProfileReference: 'profile_identifier',
  profileReferenceTable: 'profiles',
  requiredBaseProfileType: ProfileType.BUSINESS,
  storesProducts: false,
  storesInventory: false,
  storesOrders: false,
  storesPayments: false,
  storesFinancialData: false,
  storesPasswords: false,
  storesTokens: false,
  storesCredentials: false,
  storesSecrets: false,
});

export function validateBusinessProfilePersistenceRecord(input) {
  const value = input || {};
  const statusMatchesLifecycle = value.businessStatus === value.lifecycleStatus;
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_FIELDS),
    validatePattern('businessProfileIdentifier', value.businessProfileIdentifier, IDENTIFIER_PATTERN),
    validatePattern('profileIdentifier', value.profileIdentifier, IDENTIFIER_PATTERN),
    validateAllowedValue('businessType', value.businessType, Object.values(BusinessType)),
    validateAllowedValue('businessStatus', value.businessStatus, Object.values(BusinessStatus)),
    validateAllowedValue('visibility', value.visibility, Object.values(BusinessVisibility)),
    validateAllowedValue('lifecycleStatus', value.lifecycleStatus, Object.values(BusinessStatus)),
    Object.freeze({ valid: statusMatchesLifecycle, errors: Object.freeze(statusMatchesLifecycle ? [] : [{ field: 'businessStatus', code: BusinessProfileErrorCode.BUSINESS_PROFILE_INVALID, message: 'Business status must match lifecycle status.' }]) }),
  );
}

export function validateBusinessBaseProfileType(profileType) {
  const valid = profileType === ProfileType.BUSINESS;
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'profileType', code: BusinessProfileErrorCode.PROFILE_REFERENCE_INVALID, message: 'Business persistence requires a business base profile.' }]) });
}

export function assertUniqueBusinessProfileOwnership(records = []) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    if (!record?.profileIdentifier) continue;
    if (seen.has(record.profileIdentifier)) duplicates.push(record.profileIdentifier);
    seen.add(record.profileIdentifier);
  }
  return Object.freeze({ valid: duplicates.length === 0, duplicates: Object.freeze(duplicates) });
}

export function validateBusinessPersistenceLifecycleTransition(from, to) {
  const valid = canTransitionBusinessLifecycle(from, to);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'lifecycleStatus', code: BusinessProfileErrorCode.BUSINESS_LIFECYCLE_INVALID, message: 'Business profile lifecycle transition is not allowed.' }]) });
}

export function createBusinessProfileRepository({ databaseClient } = {}) {
  return Object.freeze({
    table: BusinessProfileTable,
    hasDatabaseClient: Boolean(databaseClient),
    exposesApiLogic: false,
    implementsAuthentication: false,
    implementsAuthorization: false,
    implementsBusinessWorkflow: false,
    validate: validateBusinessProfilePersistenceRecord,
    validateBaseProfileType: validateBusinessBaseProfileType,
    createDuplicateError(profileIdentifier) {
      return createBusinessProfileError(BusinessProfileErrorCode.BUSINESS_PROFILE_DUPLICATE, 'A business profile already exists for this base profile.', { profileIdentifier });
    },
    createProfileReferenceError(profileIdentifier) {
      return createBusinessProfileError(BusinessProfileErrorCode.PROFILE_REFERENCE_INVALID, 'Business profile reference is invalid.', { profileIdentifier });
    },
    createDatabaseValidationError(metadata = {}) {
      return createDatabaseError(DatabaseErrorCode.DATABASE_VALIDATION_ERROR, 'Business profile database validation failed.', metadata);
    },
  });
}
