import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { APPROVED_ACCOUNT_TYPES, APPROVED_LIFECYCLE_STATES } from '../../identity/schemas/identity-validation.mjs';
import { REQUIRED_USER_ACCOUNT_FIELDS, USER_IDENTITY_REFERENCE_PATTERN, USER_SAFE_IDENTIFIER_PATTERN, UserVisibilityClassification } from '../domain/user-account-types.mjs';

const visibilityValues = Object.freeze(Object.values(UserVisibilityClassification));

export function validateUserAccountFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_USER_ACCOUNT_FIELDS),
    validatePattern('userIdentifier', value.userIdentifier, USER_SAFE_IDENTIFIER_PATTERN, 'userIdentifier must use a safe user account identifier format.'),
    validatePattern('identityReference', value.identityReference, USER_IDENTITY_REFERENCE_PATTERN, 'identityReference must reference a future identity record safely.'),
    validateAllowedValue('accountType', value.accountType, APPROVED_ACCOUNT_TYPES),
    validateAllowedValue('accountStatus', value.accountStatus, APPROVED_LIFECYCLE_STATES),
    validateAllowedValue('lifecycleState', value.lifecycleState, APPROVED_LIFECYCLE_STATES),
    validateAllowedValue('visibility', value.visibility, visibilityValues),
  );
}

export { visibilityValues as APPROVED_USER_VISIBILITY_VALUES };
