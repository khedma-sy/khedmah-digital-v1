import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const ServiceCatalogErrorCode = Object.freeze({
  SERVICE_INVALID: 'SERVICE_INVALID',
  SERVICE_DUPLICATE: 'SERVICE_DUPLICATE',
  SERVICE_OWNERSHIP_INVALID: 'SERVICE_OWNERSHIP_INVALID',
  SERVICE_CATEGORY_INVALID: 'SERVICE_CATEGORY_INVALID',
  SERVICE_LIFECYCLE_INVALID: 'SERVICE_LIFECYCLE_INVALID',
});

const ServiceCatalogErrorCategory = Object.freeze({
  [ServiceCatalogErrorCode.SERVICE_INVALID]: ErrorCategory.VALIDATION,
  [ServiceCatalogErrorCode.SERVICE_DUPLICATE]: ErrorCategory.DUPLICATE,
  [ServiceCatalogErrorCode.SERVICE_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
  [ServiceCatalogErrorCode.SERVICE_CATEGORY_INVALID]: ErrorCategory.VALIDATION,
  [ServiceCatalogErrorCode.SERVICE_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
});

export function createServiceCatalogError(code, message, metadata = {}) {
  return new KhedmahCoreError({ code, message, category: ServiceCatalogErrorCategory[code] || ErrorCategory.SYSTEM, metadata });
}
