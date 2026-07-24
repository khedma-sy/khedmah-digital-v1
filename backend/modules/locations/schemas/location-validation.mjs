import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { AREA_REFERENCE_PATTERN, CITY_REFERENCE_PATTERN, COUNTRY_REFERENCE_PATTERN, COVERAGE_REFERENCE_PATTERN, AreaReference, CityReference, CountryReference, CoverageReferenceType, LocationHierarchy, LocationStatus, LocationType, LocationVisibility, LOCATION_IDENTITY_REFERENCE_PATTERN, REQUIRED_LOCATION_FIELDS } from '../domain/location-types.mjs';
import { validateCoverageReference } from '../domain/coverage.mjs';
import { validateLocationOwnershipReference } from '../domain/ownership.mjs';

const countryReferences = Object.freeze(Object.values(CountryReference));
const cityReferences = Object.freeze(Object.values(CityReference));
const areaReferences = Object.freeze(Object.values(AreaReference));
const locationTypes = Object.freeze(Object.values(LocationType));
const coverageReferenceTypes = Object.freeze(Object.values(CoverageReferenceType));
const locationStatuses = Object.freeze(Object.values(LocationStatus));
const locationVisibilities = Object.freeze(Object.values(LocationVisibility));

export function validateLocationHierarchyReference(country, city, area) {
  const errors = [];
  if (!countryReferences.includes(country)) errors.push({ field: 'country', code: 'LOCATION_HIERARCHY_INVALID', message: 'Country reference is unsupported.' });
  if (!cityReferences.includes(city)) errors.push({ field: 'city', code: 'LOCATION_HIERARCHY_INVALID', message: 'City reference is unsupported.' });
  if (!areaReferences.includes(area)) errors.push({ field: 'area', code: 'LOCATION_HIERARCHY_INVALID', message: 'Area reference is unsupported.' });
  if (countryReferences.includes(country) && cityReferences.includes(city) && !LocationHierarchy[country]?.[city]) errors.push({ field: 'city', code: 'LOCATION_HIERARCHY_INVALID', message: 'City must belong to the selected country.' });
  if (countryReferences.includes(country) && cityReferences.includes(city) && areaReferences.includes(area) && !LocationHierarchy[country]?.[city]?.includes(area)) errors.push({ field: 'area', code: 'LOCATION_HIERARCHY_INVALID', message: 'Area must belong to the selected city.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateLocationFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_LOCATION_FIELDS),
    validateAllowedValue('locationType', value.locationType, locationTypes),
    validateAllowedValue('coverageRef.coverageType', value.coverageRef?.coverageType, coverageReferenceTypes),
    validateAllowedValue('status', value.status, locationStatuses),
    validateAllowedValue('visibility', value.visibility, locationVisibilities),
    validatePattern('locationIdentityRef', value.locationIdentityRef, LOCATION_IDENTITY_REFERENCE_PATTERN, 'locationIdentityRef must be a safe location identity reference.'),
    validatePattern('countryRef', value.countryRef, COUNTRY_REFERENCE_PATTERN, 'countryRef must be a safe country reference.'),
    validatePattern('cityRef', value.cityRef, CITY_REFERENCE_PATTERN, 'cityRef must be a safe city reference.'),
    validatePattern('areaRef', value.areaRef, AREA_REFERENCE_PATTERN, 'areaRef must be a safe area reference.'),
    validatePattern('coverageRef.reference', value.coverageRef?.reference, COVERAGE_REFERENCE_PATTERN, 'coverageRef.reference must be a safe coverage reference.'),
    validateLocationHierarchyReference(value.country, value.city, value.area),
    validateCoverageReference(value.coverageRef),
    validateLocationOwnershipReference(value.ownershipRef),
  );
}

export { areaReferences as APPROVED_AREA_REFERENCES, cityReferences as APPROVED_CITY_REFERENCES, countryReferences as APPROVED_COUNTRY_REFERENCES, coverageReferenceTypes as APPROVED_COVERAGE_REFERENCE_TYPES, locationStatuses as APPROVED_LOCATION_STATUSES, locationTypes as APPROVED_LOCATION_TYPES, locationVisibilities as APPROVED_LOCATION_VISIBILITIES };
