import { LocationVisibility } from './location-types.mjs';

export const LocationVisibilityClass = Object.freeze({
  public: Object.freeze(['countryName', 'cityName', 'areaName']),
  private: Object.freeze(['privateAddressRef', 'addressLineReference']),
  internal: Object.freeze(['operationalMetadataRef', 'coverageGovernanceRef', 'auditCorrelationRef']),
});

export function validateLocationVisibilityExposure({ visibility, fieldClass, exposesPrivateAddress = false, exposesInternalReference = false } = {}) {
  const errors = [];
  if (!Object.values(LocationVisibility).includes(visibility)) errors.push({ field: 'visibility', code: 'LOCATION_INVALID', message: 'Location visibility is unsupported.' });
  if (visibility === LocationVisibility.PUBLIC && (fieldClass === LocationVisibility.PRIVATE || fieldClass === LocationVisibility.INTERNAL || exposesPrivateAddress || exposesInternalReference)) errors.push({ field: 'visibility', code: 'LOCATION_INVALID', message: 'Public location exposure must not reveal private addresses or internal references.' });
  if (visibility === LocationVisibility.PRIVATE && (fieldClass === LocationVisibility.INTERNAL || exposesInternalReference)) errors.push({ field: 'visibility', code: 'LOCATION_INVALID', message: 'Private location exposure must not reveal internal operational metadata.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
