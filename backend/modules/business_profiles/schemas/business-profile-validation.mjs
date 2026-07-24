import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { BusinessStatus, BusinessType, BusinessVisibility, BUSINESS_IDENTITY_REFERENCE_PATTERN, PROFILE_REFERENCE_PATTERN, REQUIRED_BUSINESS_PROFILE_FIELDS, USER_ACCOUNT_REFERENCE_PATTERN } from '../domain/business-types.mjs';
import { validateBusinessOwnershipReference } from '../domain/ownership.mjs';

const businessTypes = Object.freeze(Object.values(BusinessType));
const businessStatuses = Object.freeze(Object.values(BusinessStatus));
const businessVisibilities = Object.freeze(Object.values(BusinessVisibility));

export function validateBusinessProfileFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_BUSINESS_PROFILE_FIELDS),
    validateAllowedValue('businessType', value.businessType, businessTypes),
    validateAllowedValue('status', value.status, businessStatuses),
    validateAllowedValue('visibility', value.visibility, businessVisibilities),
    validatePattern('businessIdentityRef', value.businessIdentityRef, BUSINESS_IDENTITY_REFERENCE_PATTERN, 'businessIdentityRef must be a safe business identity reference.'),
    validatePattern('profileRef', value.profileRef, PROFILE_REFERENCE_PATTERN, 'profileRef must be a safe base profile reference.'),
    validatePattern('ownershipRef.userAccountRef', value.ownershipRef?.userAccountRef, USER_ACCOUNT_REFERENCE_PATTERN, 'ownershipRef.userAccountRef must be a safe user account reference.'),
    validatePattern('ownershipRef.profileRef', value.ownershipRef?.profileRef, PROFILE_REFERENCE_PATTERN, 'ownershipRef.profileRef must be a safe base profile reference.'),
    validateBusinessOwnershipReference(value.ownershipRef),
  );
}

export { businessStatuses as APPROVED_BUSINESS_STATUSES, businessTypes as APPROVED_BUSINESS_TYPES, businessVisibilities as APPROVED_BUSINESS_VISIBILITIES };
