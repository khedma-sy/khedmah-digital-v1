import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { ProfessionType, ProfessionalStatus, ProfessionalVisibility, PROFESSIONAL_IDENTITY_REFERENCE_PATTERN, PROFILE_REFERENCE_PATTERN, REQUIRED_PROFESSIONAL_PROFILE_FIELDS, USER_ACCOUNT_REFERENCE_PATTERN } from '../domain/professional-types.mjs';
import { validateProfessionalOwnershipReference } from '../domain/ownership.mjs';

const professionTypes = Object.freeze(Object.values(ProfessionType));
const professionalStatuses = Object.freeze(Object.values(ProfessionalStatus));
const professionalVisibilities = Object.freeze(Object.values(ProfessionalVisibility));

export function validateProfessionalProfileFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_PROFESSIONAL_PROFILE_FIELDS),
    validateAllowedValue('professionType', value.professionType, professionTypes),
    validateAllowedValue('status', value.status, professionalStatuses),
    validateAllowedValue('visibility', value.visibility, professionalVisibilities),
    validatePattern('professionalIdentityRef', value.professionalIdentityRef, PROFESSIONAL_IDENTITY_REFERENCE_PATTERN, 'professionalIdentityRef must be a safe professional identity reference.'),
    validatePattern('profileRef', value.profileRef, PROFILE_REFERENCE_PATTERN, 'profileRef must be a safe base profile reference.'),
    validatePattern('ownershipRef.userAccountRef', value.ownershipRef?.userAccountRef, USER_ACCOUNT_REFERENCE_PATTERN, 'ownershipRef.userAccountRef must be a safe user account reference.'),
    validatePattern('ownershipRef.profileRef', value.ownershipRef?.profileRef, PROFILE_REFERENCE_PATTERN, 'ownershipRef.profileRef must be a safe base profile reference.'),
    validateProfessionalOwnershipReference(value.ownershipRef),
  );
}

export { professionTypes as APPROVED_PROFESSION_TYPES, professionalStatuses as APPROVED_PROFESSIONAL_STATUSES, professionalVisibilities as APPROVED_PROFESSIONAL_VISIBILITIES };
