import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const LocationErrorCode = Object.freeze({
  LOCATION_INVALID: 'LOCATION_INVALID',
  LOCATION_DUPLICATE: 'LOCATION_DUPLICATE',
  LOCATION_HIERARCHY_INVALID: 'LOCATION_HIERARCHY_INVALID',
  LOCATION_OWNERSHIP_INVALID: 'LOCATION_OWNERSHIP_INVALID',
  LOCATION_LIFECYCLE_INVALID: 'LOCATION_LIFECYCLE_INVALID',
});

const LocationErrorCategory = Object.freeze({
  [LocationErrorCode.LOCATION_INVALID]: ErrorCategory.VALIDATION,
  [LocationErrorCode.LOCATION_DUPLICATE]: ErrorCategory.DUPLICATE,
  [LocationErrorCode.LOCATION_HIERARCHY_INVALID]: ErrorCategory.VALIDATION,
  [LocationErrorCode.LOCATION_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
  [LocationErrorCode.LOCATION_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
});

export function createLocationError(code, message, metadata = {}) {
  return new KhedmahCoreError({ code, message, category: LocationErrorCategory[code] || ErrorCategory.SYSTEM, metadata });
}
