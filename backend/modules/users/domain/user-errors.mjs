import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';
import { IdentityErrorCode } from '../../identity/domain/errors.mjs';

export const UserAccountErrorCode = Object.freeze({
  USER_ACCOUNT_INVALID: 'USER_ACCOUNT_INVALID',
  USER_ACCOUNT_DUPLICATE: 'USER_ACCOUNT_DUPLICATE',
  USER_ACCOUNT_FORBIDDEN: 'USER_ACCOUNT_FORBIDDEN',
  USER_ACCOUNT_LIFECYCLE_INVALID: 'USER_ACCOUNT_LIFECYCLE_INVALID',
});

export const USER_IDENTITY_ERROR_COMPATIBILITY = Object.freeze({
  invalidIdentityData: IdentityErrorCode.INVALID_IDENTITY_DATA,
  duplicateIdentityConflict: IdentityErrorCode.DUPLICATE_IDENTITY_CONFLICT,
  forbiddenIdentityAction: IdentityErrorCode.FORBIDDEN_IDENTITY_ACTION,
  invalidLifecycleTransition: IdentityErrorCode.INVALID_LIFECYCLE_TRANSITION,
});

export function createUserAccountError(code, message, metadata = {}) {
  const categoryByCode = {
    [UserAccountErrorCode.USER_ACCOUNT_INVALID]: ErrorCategory.VALIDATION,
    [UserAccountErrorCode.USER_ACCOUNT_DUPLICATE]: ErrorCategory.DUPLICATE,
    [UserAccountErrorCode.USER_ACCOUNT_FORBIDDEN]: ErrorCategory.AUTHORIZATION,
    [UserAccountErrorCode.USER_ACCOUNT_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
