import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { createDatabaseError, DatabaseErrorCode } from '../../../database/errors/database-errors.mjs';
import { ProfileErrorCode, createProfileError } from '../../profiles/domain/errors.mjs';
import { ProfileType } from '../../profiles/domain/profile-types.mjs';
import { ProfessionalProfileErrorCode, createProfessionalProfileError } from '../domain/errors.mjs';
import { canTransitionProfessionalLifecycle } from '../domain/lifecycle.mjs';
import { ProfessionType, ProfessionalStatus, ProfessionalVisibility } from '../domain/professional-types.mjs';

const REQUIRED_FIELDS = Object.freeze(['professionalProfileIdentifier', 'profileIdentifier', 'professionType', 'professionalStatus', 'visibility', 'lifecycleStatus']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export const ProfessionalProfileTable = Object.freeze({
  name: 'professional_profiles',
  primaryKey: 'professional_profile_identifier',
  uniqueProfileReference: 'profile_identifier',
  profileReferenceTable: 'profiles',
  requiredBaseProfileType: ProfileType.PROFESSIONAL,
  storesCertificates: false,
  storesLicenses: false,
  storesDocuments: false,
  storesVerificationEvidence: false,
  storesServices: false,
  storesPasswords: false,
  storesTokens: false,
  storesCredentials: false,
  storesSecrets: false,
});

export function validateProfessionalProfilePersistenceRecord(input) {
  const value = input || {};
  const statusMatchesLifecycle = value.professionalStatus === value.lifecycleStatus;
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_FIELDS),
    validatePattern('professionalProfileIdentifier', value.professionalProfileIdentifier, IDENTIFIER_PATTERN),
    validatePattern('profileIdentifier', value.profileIdentifier, IDENTIFIER_PATTERN),
    validateAllowedValue('professionType', value.professionType, Object.values(ProfessionType)),
    validateAllowedValue('professionalStatus', value.professionalStatus, Object.values(ProfessionalStatus)),
    validateAllowedValue('visibility', value.visibility, Object.values(ProfessionalVisibility)),
    validateAllowedValue('lifecycleStatus', value.lifecycleStatus, Object.values(ProfessionalStatus)),
    Object.freeze({ valid: statusMatchesLifecycle, errors: Object.freeze(statusMatchesLifecycle ? [] : [{ field: 'professionalStatus', code: ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_INVALID, message: 'Professional status must match lifecycle status.' }]) }),
  );
}

export function validateProfessionalBaseProfileType(profileType) {
  const valid = profileType === ProfileType.PROFESSIONAL;
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'profileType', code: ProfileErrorCode.PROFILE_REFERENCE_INVALID, message: 'Professional persistence requires a professional base profile.' }]) });
}

export function assertUniqueProfessionalProfileOwnership(records = []) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    if (!record?.profileIdentifier) continue;
    if (seen.has(record.profileIdentifier)) duplicates.push(record.profileIdentifier);
    seen.add(record.profileIdentifier);
  }
  return Object.freeze({ valid: duplicates.length === 0, duplicates: Object.freeze(duplicates) });
}

export function validateProfessionalPersistenceLifecycleTransition(from, to) {
  const valid = canTransitionProfessionalLifecycle(from, to);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'lifecycleStatus', code: ProfessionalProfileErrorCode.PROFESSIONAL_LIFECYCLE_INVALID, message: 'Professional profile lifecycle transition is not allowed.' }]) });
}

export function createProfessionalProfileRepository({ databaseClient } = {}) {
  return Object.freeze({
    table: ProfessionalProfileTable,
    hasDatabaseClient: Boolean(databaseClient),
    exposesApiLogic: false,
    implementsAuthentication: false,
    implementsAuthorization: false,
    implementsBusinessWorkflow: false,
    validate: validateProfessionalProfilePersistenceRecord,
    validateBaseProfileType: validateProfessionalBaseProfileType,
    createDuplicateError(profileIdentifier) {
      return createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE, 'A professional profile already exists for this base profile.', { profileIdentifier });
    },
    createProfileReferenceError(profileIdentifier) {
      return createProfileError(ProfileErrorCode.PROFILE_REFERENCE_INVALID, 'Professional profile reference is invalid.', { profileIdentifier });
    },
    createDatabaseValidationError(metadata = {}) {
      return createDatabaseError(DatabaseErrorCode.DATABASE_VALIDATION_ERROR, 'Professional profile database validation failed.', metadata);
    },
  });
}
