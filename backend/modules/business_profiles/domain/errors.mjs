import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const BusinessProfileErrorCode = Object.freeze({
  BUSINESS_PROFILE_INVALID: 'BUSINESS_PROFILE_INVALID',
  BUSINESS_PROFILE_DUPLICATE: 'BUSINESS_PROFILE_DUPLICATE',
  BUSINESS_OWNERSHIP_INVALID: 'BUSINESS_OWNERSHIP_INVALID',
  BUSINESS_VISIBILITY_INVALID: 'BUSINESS_VISIBILITY_INVALID',
  BUSINESS_LIFECYCLE_INVALID: 'BUSINESS_LIFECYCLE_INVALID',
});

export function createBusinessProfileError(code, message, metadata = {}) {
  const categoryByCode = {
    [BusinessProfileErrorCode.BUSINESS_PROFILE_INVALID]: ErrorCategory.VALIDATION,
    [BusinessProfileErrorCode.BUSINESS_PROFILE_DUPLICATE]: ErrorCategory.DUPLICATE,
    [BusinessProfileErrorCode.BUSINESS_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
    [BusinessProfileErrorCode.BUSINESS_VISIBILITY_INVALID]: ErrorCategory.VALIDATION,
    [BusinessProfileErrorCode.BUSINESS_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
