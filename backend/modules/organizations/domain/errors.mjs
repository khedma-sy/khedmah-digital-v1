import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const OrganizationErrorCode = Object.freeze({
  ORGANIZATION_INVALID: 'ORGANIZATION_INVALID',
  ORGANIZATION_DUPLICATE: 'ORGANIZATION_DUPLICATE',
  ORGANIZATION_OWNERSHIP_INVALID: 'ORGANIZATION_OWNERSHIP_INVALID',
  ORGANIZATION_MEMBER_INVALID: 'ORGANIZATION_MEMBER_INVALID',
  ORGANIZATION_LIFECYCLE_INVALID: 'ORGANIZATION_LIFECYCLE_INVALID',
});

export function createOrganizationError(code, message, metadata = {}) {
  const categoryByCode = {
    [OrganizationErrorCode.ORGANIZATION_INVALID]: ErrorCategory.VALIDATION,
    [OrganizationErrorCode.ORGANIZATION_DUPLICATE]: ErrorCategory.DUPLICATE,
    [OrganizationErrorCode.ORGANIZATION_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
    [OrganizationErrorCode.ORGANIZATION_MEMBER_INVALID]: ErrorCategory.VALIDATION,
    [OrganizationErrorCode.ORGANIZATION_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
