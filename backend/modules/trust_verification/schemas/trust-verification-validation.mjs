import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { REQUIRED_TRUST_FIELDS, TRUST_LEVEL_REFERENCE_PATTERN, TRUST_RECORD_REFERENCE_PATTERN, TRUST_SUBJECT_REFERENCE_PATTERN, TrustLevelReference, TrustStatus, TrustSubjectType, TrustVisibility, VERIFICATION_REFERENCE_PATTERN, VerificationStatus, VerificationType } from '../domain/trust-types.mjs';
import { validateTrustLifecycleTransition } from '../domain/lifecycle.mjs';
import { validateTrustOwnershipBoundary } from '../domain/ownership.mjs';
import { validateTrustSubjectReference } from '../domain/subjects.mjs';

const trustSubjectTypes = Object.freeze(Object.values(TrustSubjectType));
const verificationTypes = Object.freeze(Object.values(VerificationType));
const trustStatuses = Object.freeze(Object.values(TrustStatus));
const verificationStatuses = Object.freeze(Object.values(VerificationStatus));
const trustVisibilities = Object.freeze(Object.values(TrustVisibility));
const trustLevelReferences = Object.freeze(Object.values(TrustLevelReference));

export function validateTrustVerificationFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_TRUST_FIELDS),
    validateAllowedValue('subjectType', value.subjectType, trustSubjectTypes),
    validateAllowedValue('verificationType', value.verificationType, verificationTypes),
    validateAllowedValue('trustStatus', value.trustStatus, trustStatuses),
    validateAllowedValue('verificationStatus', value.verificationStatus, verificationStatuses),
    validateAllowedValue('trustLevelRef', value.trustLevelRef, trustLevelReferences),
    validateAllowedValue('visibility', value.visibility, trustVisibilities),
    validatePattern('trustRecordRef', value.trustRecordRef, TRUST_RECORD_REFERENCE_PATTERN, 'trustRecordRef must be a safe trust record reference.'),
    validatePattern('verificationRef', value.verificationRef, VERIFICATION_REFERENCE_PATTERN, 'verificationRef must be a safe verification reference.'),
    validatePattern('subjectRef', value.subjectRef, TRUST_SUBJECT_REFERENCE_PATTERN, 'subjectRef must be a safe trust subject reference.'),
    validatePattern('trustLevelRef', value.trustLevelRef, TRUST_LEVEL_REFERENCE_PATTERN, 'trustLevelRef must be a safe trust level reference.'),
    validateTrustSubjectReference({ subjectType: value.subjectType, subjectRef: value.subjectRef, ownsUser: value.ownsUser, ownsBusiness: value.ownsBusiness, ownsService: value.ownsService, ownsOrganization: value.ownsOrganization }),
    validateTrustOwnershipBoundary(value),
  );
}

export function validateTrustStatusCompatibility(fromStatus, toStatus) {
  return validateTrustLifecycleTransition(fromStatus, toStatus);
}

export { trustLevelReferences as APPROVED_TRUST_LEVEL_REFERENCES, trustStatuses as APPROVED_TRUST_STATUSES, trustSubjectTypes as APPROVED_TRUST_SUBJECT_TYPES, trustVisibilities as APPROVED_TRUST_VISIBILITIES, verificationStatuses as APPROVED_VERIFICATION_STATUSES, verificationTypes as APPROVED_VERIFICATION_TYPES };
