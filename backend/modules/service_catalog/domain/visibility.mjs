import { ServiceVisibility } from './service-types.mjs';

export const ServiceVisibilityClass = Object.freeze({
  public: Object.freeze(['serviceName', 'descriptionRef', 'categoryRef']),
  private: Object.freeze(['ownerRef', 'internalProviderReference']),
  internal: Object.freeze(['operationalMetadataRef', 'auditCorrelationRef', 'governanceReviewRef']),
});

export function validateServiceVisibilityExposure({ visibility, fieldClass, exposesPrivateReference = false, exposesInternalReference = false } = {}) {
  const errors = [];
  if (!Object.values(ServiceVisibility).includes(visibility)) errors.push({ field: 'visibility', code: 'SERVICE_INVALID', message: 'Service visibility is unsupported.' });
  if (visibility === ServiceVisibility.PUBLIC && (fieldClass === ServiceVisibility.PRIVATE || fieldClass === ServiceVisibility.INTERNAL || exposesPrivateReference || exposesInternalReference)) errors.push({ field: 'visibility', code: 'SERVICE_INVALID', message: 'Public service exposure must not reveal private or internal references.' });
  if (visibility === ServiceVisibility.PRIVATE && (fieldClass === ServiceVisibility.INTERNAL || exposesInternalReference)) errors.push({ field: 'visibility', code: 'SERVICE_INVALID', message: 'Private service exposure must not reveal internal operational metadata.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
