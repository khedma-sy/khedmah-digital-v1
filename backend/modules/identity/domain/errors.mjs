import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const IdentityErrorCode = Object.freeze({
  INVALID_IDENTITY_DATA: 'INVALID_IDENTITY_DATA',
  INVALID_LIFECYCLE_TRANSITION: 'INVALID_LIFECYCLE_TRANSITION',
  DUPLICATE_IDENTITY_CONFLICT: 'DUPLICATE_IDENTITY_CONFLICT',
  FORBIDDEN_IDENTITY_ACTION: 'FORBIDDEN_IDENTITY_ACTION',
});

export function createIdentityError(code, message, metadata = {}) {
  const categoryByCode = {
    [IdentityErrorCode.INVALID_IDENTITY_DATA]: ErrorCategory.VALIDATION,
    [IdentityErrorCode.INVALID_LIFECYCLE_TRANSITION]: ErrorCategory.LIFECYCLE,
    [IdentityErrorCode.DUPLICATE_IDENTITY_CONFLICT]: ErrorCategory.DUPLICATE,
    [IdentityErrorCode.FORBIDDEN_IDENTITY_ACTION]: ErrorCategory.AUTHORIZATION,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
