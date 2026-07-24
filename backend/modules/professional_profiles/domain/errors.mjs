import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const ProfessionalProfileErrorCode = Object.freeze({
  PROFESSIONAL_PROFILE_INVALID: 'PROFESSIONAL_PROFILE_INVALID',
  PROFESSIONAL_PROFILE_DUPLICATE: 'PROFESSIONAL_PROFILE_DUPLICATE',
  PROFESSIONAL_OWNERSHIP_INVALID: 'PROFESSIONAL_OWNERSHIP_INVALID',
  PROFESSIONAL_VISIBILITY_INVALID: 'PROFESSIONAL_VISIBILITY_INVALID',
  PROFESSIONAL_LIFECYCLE_INVALID: 'PROFESSIONAL_LIFECYCLE_INVALID',
});

export function createProfessionalProfileError(code, message, metadata = {}) {
  const categoryByCode = {
    [ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_INVALID]: ErrorCategory.VALIDATION,
    [ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE]: ErrorCategory.DUPLICATE,
    [ProfessionalProfileErrorCode.PROFESSIONAL_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
    [ProfessionalProfileErrorCode.PROFESSIONAL_VISIBILITY_INVALID]: ErrorCategory.VALIDATION,
    [ProfessionalProfileErrorCode.PROFESSIONAL_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
