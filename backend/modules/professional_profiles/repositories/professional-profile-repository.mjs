import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { ProfessionalProfileErrorCode, createProfessionalProfileError } from '../domain/errors.mjs';
import { canTransitionProfessionalLifecycle } from '../domain/lifecycle.mjs';
import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const ProfessionalProfileTable = Object.freeze({
  name: 'professional_profiles',
  primaryKey: 'professional_profile_identifier',
  uniqueProfileReference: 'profile_identifier',
  ownerReference: 'user_identifier',
  parentTable: 'profiles',
  parentDeletion: 'RESTRICT',
  visibilityIsAuthorization: false,
  implementsVerification: false,
  storesPasswords: false,
  storesTokens: false,
  storesCredentials: false,
  storesSessions: false,
  storesPrivateDocuments: false,
  storesCertificates: false,
  storesFinancialInformation: false,
});

export const ProfessionalProfileColumn = Object.freeze({
  PROFESSIONAL_PROFILE_IDENTIFIER: 'professional_profile_identifier',
  PROFILE_IDENTIFIER: 'profile_identifier',
  USER_IDENTIFIER: 'user_identifier',
  PROFESSION_TYPE: 'profession_type',
  LIFECYCLE_STATUS: 'lifecycle_status',
  VISIBILITY: 'visibility',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  ARCHIVED_AT: 'archived_at',
});

const PROFESSIONAL_PROFILE_IDENTIFIER_PATTERN = /^professional_profile_[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const PROFILE_IDENTIFIER_PATTERN = /^profile_[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const USER_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const professionTypes = Object.freeze(['doctor', 'dentist', 'engineer', 'lawyer', 'consultant', 'freelancer', 'technical_specialist']);
const lifecycleStatuses = Object.freeze(Object.values(ProfileStatus));
const visibilities = Object.freeze(Object.values(ProfileVisibility));

export function validateProfessionalProfilePersistenceRecord(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, ['professionalProfileIdentifier', 'profileIdentifier', 'userIdentifier', 'professionType', 'lifecycleStatus', 'visibility']),
    validatePattern('professionalProfileIdentifier', value.professionalProfileIdentifier, PROFESSIONAL_PROFILE_IDENTIFIER_PATTERN, 'Professional Profile identifier has an invalid format.'),
    validatePattern('profileIdentifier', value.profileIdentifier, PROFILE_IDENTIFIER_PATTERN, 'Profile reference has an invalid format.'),
    validatePattern('userIdentifier', value.userIdentifier, USER_IDENTIFIER_PATTERN, 'User reference has an invalid format.'),
    validateAllowedValue('professionType', value.professionType, professionTypes),
    validateAllowedValue('lifecycleStatus', value.lifecycleStatus, lifecycleStatuses),
    validateAllowedValue('visibility', value.visibility, visibilities),
  );
}

export function assertUniqueProfessionalProfileIdentity(records = []) {
  const identifiers = new Set();
  const profileReferences = new Set();
  const duplicates = [];
  for (const record of records) {
    if (record?.professionalProfileIdentifier && identifiers.has(record.professionalProfileIdentifier)) duplicates.push({ field: 'professionalProfileIdentifier', value: record.professionalProfileIdentifier });
    if (record?.profileIdentifier && profileReferences.has(record.profileIdentifier)) duplicates.push({ field: 'profileIdentifier', value: record.profileIdentifier });
    if (record?.professionalProfileIdentifier) identifiers.add(record.professionalProfileIdentifier);
    if (record?.profileIdentifier) profileReferences.add(record.profileIdentifier);
  }
  return Object.freeze({ valid: duplicates.length === 0, duplicates: Object.freeze(duplicates.map((duplicate) => Object.freeze(duplicate))) });
}

export function validateProfessionalProfilePersistenceLifecycleTransition(from, to) {
  const valid = canTransitionProfessionalLifecycle(from, to);
  return Object.freeze({
    valid,
    errors: Object.freeze(valid ? [] : [{ field: 'lifecycleStatus', code: ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_LIFECYCLE_INVALID, message: 'Professional Profile lifecycle transition is not allowed.' }]),
  });
}

export function createProfessionalProfileRepository({ databaseClient } = {}) {
  return Object.freeze({
    table: ProfessionalProfileTable,
    hasDatabaseClient: Boolean(databaseClient),
    exposesApiLogic: false,
    implementsAuthentication: false,
    implementsVerificationWorkflow: false,
    implementsBusinessWorkflow: false,
    validate: validateProfessionalProfilePersistenceRecord,
    findByIdentifier(identifier) {
      return databaseClient?.findProfessionalProfileByIdentifier?.(identifier);
    },
    findByProfileIdentifier(identifier) {
      return databaseClient?.findProfessionalProfileByProfileIdentifier?.(identifier);
    },
    findByUserIdentifier(identifier) {
      return databaseClient?.findProfessionalProfilesByUserIdentifier?.(identifier);
    },
    createInvalidError() {
      return createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_INVALID, 'Professional Profile data is invalid.');
    },
    createDuplicateError() {
      return createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE, 'Professional Profile identity already exists.');
    },
    createProfileReferenceError() {
      return createProfessionalProfileError(ProfessionalProfileErrorCode.PROFILE_REFERENCE_INVALID, 'Profile reference is invalid.');
    },
    createLifecycleError() {
      return createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_LIFECYCLE_INVALID, 'Professional Profile lifecycle is invalid.');
    },
    createVisibilityError() {
      return createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_VISIBILITY_INVALID, 'Professional Profile visibility is invalid.');
    },
  });
}

export const APPROVED_PROFESSION_PERSISTENCE_TYPES = professionTypes;
export const APPROVED_PROFESSIONAL_PROFILE_LIFECYCLES = lifecycleStatuses;
export const APPROVED_PROFESSIONAL_PROFILE_VISIBILITIES = visibilities;
