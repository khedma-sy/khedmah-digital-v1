import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const LocationConcept = Object.freeze({
  LOCATION: 'Location',
  COUNTRY: 'Country',
  CITY: 'City',
  AREA: 'Area',
  LOCATION_TYPE: 'Location Type',
  SERVICE_COVERAGE_REFERENCE: 'Service Coverage Reference',
  LOCATION_VISIBILITY: 'Location Visibility',
  LOCATION_STATUS: 'Location Status',
  LOCATION_OWNERSHIP_REFERENCE: 'Location Ownership Reference',
});

export const CountryReference = Object.freeze({
  SYRIA: 'syria',
});

export const CityReference = Object.freeze({
  DAMASCUS: 'damascus',
});

export const AreaReference = Object.freeze({
  AL_MIDAN: 'al_midan',
});

export const LocationHierarchy = Object.freeze({
  [CountryReference.SYRIA]: Object.freeze({
    [CityReference.DAMASCUS]: Object.freeze([AreaReference.AL_MIDAN]),
  }),
});

export const LocationType = Object.freeze({
  COUNTRY: 'country',
  CITY: 'city',
  AREA: 'area',
  SERVICE_COVERAGE: 'service_coverage',
});

export const CoverageReferenceType = Object.freeze({
  BUSINESS_LOCATION: 'business_location',
  PROFESSIONAL_LOCATION: 'professional_location',
  ORGANIZATION_LOCATION: 'organization_location',
  SERVICE_COVERAGE_AREA: 'service_coverage_area',
  PARTNER_COVERAGE_REFERENCE: 'partner_coverage_reference',
});

export const LocationVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const LocationStatus = Object.freeze({
  CREATED: ProfileStatus.CREATED,
  PENDING: ProfileStatus.PENDING,
  ACTIVE: ProfileStatus.ACTIVE,
  SUSPENDED: ProfileStatus.SUSPENDED,
  ARCHIVED: ProfileStatus.ARCHIVED,
});

export const REQUIRED_LOCATION_FIELDS = Object.freeze(['locationIdentityRef', 'locationType', 'countryRef', 'cityRef', 'areaRef', 'coverageRef', 'visibility', 'status', 'ownershipRef']);
export const LOCATION_IDENTITY_REFERENCE_PATTERN = /^location_identity:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const COUNTRY_REFERENCE_PATTERN = /^country:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const CITY_REFERENCE_PATTERN = /^city:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const AREA_REFERENCE_PATTERN = /^area:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const COVERAGE_REFERENCE_PATTERN = /^(business_location|professional_location|organization_location|service_coverage_area|partner_coverage_reference):[a-z0-9][a-z0-9._:-]{2,127}$/i;
