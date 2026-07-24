import { CoverageReferenceType } from './location-types.mjs';

export const LocationCoverageBoundary = Object.freeze({
  BUSINESS_LOCATION_REFERENCE_ONLY: 'business_location_reference_only',
  PROFESSIONAL_LOCATION_REFERENCE_ONLY: 'professional_location_reference_only',
  ORGANIZATION_LOCATION_REFERENCE_ONLY: 'organization_location_reference_only',
  SERVICE_COVERAGE_AREA_REFERENCE_ONLY: 'service_coverage_area_reference_only',
  PARTNER_COVERAGE_REFERENCE_ONLY: 'partner_coverage_reference_only',
});

export const ForbiddenLocationCoverageRule = Object.freeze({
  LOCATION_OWNS_BUSINESS: 'location_owns_business',
  LOCATION_OWNS_SERVICE: 'location_owns_service',
  LOCATION_AS_MARKETPLACE_ZONE: 'location_as_marketplace_zone',
  DELIVERY_ZONE_IMPLEMENTATION: 'delivery_zone_implementation',
});

export function validateCoverageReference(coverageRef = {}) {
  const errors = [];
  if (!Object.values(CoverageReferenceType).includes(coverageRef.coverageType)) errors.push({ field: 'coverageRef.coverageType', code: 'LOCATION_INVALID', message: 'Coverage reference type is unsupported.' });
  if (typeof coverageRef.reference !== 'string' || coverageRef.reference.length === 0) errors.push({ field: 'coverageRef.reference', code: 'LOCATION_INVALID', message: 'Coverage reference requires a stable reference value.' });
  if (coverageRef.locationOwnsBusiness || coverageRef.locationOwnsService || coverageRef.marketplaceZoneRef || coverageRef.deliveryZoneRef) errors.push({ field: 'coverageRef', code: 'LOCATION_OWNERSHIP_INVALID', message: 'Location cannot own businesses, own services, become a marketplace zone, or implement delivery zones.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
