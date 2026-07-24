import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { AccountStatus, AccountType, IDENTITY_IDENTIFIER_PATTERN, REQUIRED_IDENTITY_FIELDS } from '../domain/identity-types.mjs';

const accountTypes = Object.freeze(Object.values(AccountType));
const lifecycleStates = Object.freeze(Object.values(AccountStatus));

export function validateIdentityFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_IDENTITY_FIELDS),
    validateAllowedValue('accountType', value.accountType, accountTypes),
    validateAllowedValue('status', value.status, lifecycleStates),
    validateAllowedValue('lifecycleState', value.lifecycleState, lifecycleStates),
    validatePattern('identifier', value.identifier, IDENTITY_IDENTIFIER_PATTERN, 'identifier must use a safe account identifier format.'),
  );
}

export { accountTypes as APPROVED_ACCOUNT_TYPES, lifecycleStates as APPROVED_LIFECYCLE_STATES };
