import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { ProfileStatus, ProfileType, ProfileVisibility, PROFILE_IDENTITY_REFERENCE_PATTERN, REQUIRED_PROFILE_FIELDS, USER_ACCOUNT_REFERENCE_PATTERN } from '../domain/profile-types.mjs';
import { validateProfileOwnershipReference } from '../domain/ownership.mjs';

const profileTypes = Object.freeze(Object.values(ProfileType));
const profileStatuses = Object.freeze(Object.values(ProfileStatus));
const profileVisibilities = Object.freeze(Object.values(ProfileVisibility));

export function validateProfileFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_PROFILE_FIELDS),
    validateAllowedValue('profileType', value.profileType, profileTypes),
    validateAllowedValue('status', value.status, profileStatuses),
    validateAllowedValue('visibility', value.visibility, profileVisibilities),
    validatePattern('profileIdentityRef', value.profileIdentityRef, PROFILE_IDENTITY_REFERENCE_PATTERN, 'profileIdentityRef must be a safe profile identity reference.'),
    validatePattern('ownershipRef.userAccountRef', value.ownershipRef?.userAccountRef, USER_ACCOUNT_REFERENCE_PATTERN, 'ownershipRef.userAccountRef must be a safe user account reference.'),
    validateProfileOwnershipReference(value.ownershipRef),
  );
}

export { profileStatuses as APPROVED_PROFILE_STATUSES, profileTypes as APPROVED_PROFILE_TYPES, profileVisibilities as APPROVED_PROFILE_VISIBILITIES };
