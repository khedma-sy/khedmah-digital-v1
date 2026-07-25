import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const ProfileErrorCode = Object.freeze({
  PROFILE_INVALID: 'PROFILE_INVALID',
  PROFILE_DUPLICATE: 'PROFILE_DUPLICATE',
  PROFILE_USER_REFERENCE_INVALID: 'PROFILE_USER_REFERENCE_INVALID',
  PROFILE_OWNERSHIP_INVALID: 'PROFILE_OWNERSHIP_INVALID',
  PROFILE_VISIBILITY_INVALID: 'PROFILE_VISIBILITY_INVALID',
  PROFILE_LIFECYCLE_INVALID: 'PROFILE_LIFECYCLE_INVALID',
});

export function createProfileError(code, message, metadata = {}) {
  const categoryByCode = {
    [ProfileErrorCode.PROFILE_INVALID]: ErrorCategory.VALIDATION,
    [ProfileErrorCode.PROFILE_DUPLICATE]: ErrorCategory.DUPLICATE,
    [ProfileErrorCode.PROFILE_USER_REFERENCE_INVALID]: ErrorCategory.RELATIONSHIP,
    [ProfileErrorCode.PROFILE_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
    [ProfileErrorCode.PROFILE_VISIBILITY_INVALID]: ErrorCategory.VALIDATION,
    [ProfileErrorCode.PROFILE_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
