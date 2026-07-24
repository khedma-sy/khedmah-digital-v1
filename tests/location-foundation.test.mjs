import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { LocationAuditEvent, isLocationAuditEventName } from '../backend/modules/locations/domain/audit-events.mjs';
import { ForbiddenLocationCoverageRule, LocationCoverageBoundary, validateCoverageReference } from '../backend/modules/locations/domain/coverage.mjs';
import { createLocationError, LocationErrorCode } from '../backend/modules/locations/domain/errors.mjs';
import { canTransitionLocationLifecycle, validateLocationLifecycleTransition } from '../backend/modules/locations/domain/lifecycle.mjs';
import { ForbiddenLocationOwnershipRule, LocationOwnerReferenceType, LocationOwnershipBoundary, validateLocationOwnershipReference } from '../backend/modules/locations/domain/ownership.mjs';
import { LocationSecurityPolicy, assertNoLocationSensitiveExposure } from '../backend/modules/locations/domain/security-policy.mjs';
import { AreaReference, CityReference, CountryReference, CoverageReferenceType, LocationConcept, LocationHierarchy, LocationStatus, LocationType, LocationVisibility } from '../backend/modules/locations/domain/location-types.mjs';
import { LocationVisibilityClass, validateLocationVisibilityExposure } from '../backend/modules/locations/domain/visibility.mjs';
import { APPROVED_AREA_REFERENCES, APPROVED_CITY_REFERENCES, APPROVED_COUNTRY_REFERENCES, APPROVED_COVERAGE_REFERENCE_TYPES, APPROVED_LOCATION_STATUSES, APPROVED_LOCATION_TYPES, APPROVED_LOCATION_VISIBILITIES, validateLocationFoundation, validateLocationHierarchyReference } from '../backend/modules/locations/schemas/location-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validLocation = Object.freeze({
  locationIdentityRef: 'location_identity:al-midan-001',
  locationType: LocationType.AREA,
  country: CountryReference.SYRIA,
  city: CityReference.DAMASCUS,
  area: AreaReference.AL_MIDAN,
  countryRef: 'country:syria',
  cityRef: 'city:damascus',
  areaRef: 'area:al_midan',
  coverageRef: Object.freeze({ coverageType: CoverageReferenceType.SERVICE_COVERAGE_AREA, reference: 'service_coverage_area:al-midan-001' }),
  visibility: LocationVisibility.PUBLIC,
  status: LocationStatus.CREATED,
  ownershipRef: Object.freeze({ ownerReferenceType: LocationOwnerReferenceType.PROFILE, ownerRef: 'profile:public-001' }),
});

test('locations module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/locations/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('location concepts define geographic identity and coverage references only', () => {
  assert.equal(LocationConcept.LOCATION, 'Location');
  assert.equal(LocationConcept.COUNTRY, 'Country');
  assert.equal(LocationConcept.CITY, 'City');
  assert.equal(LocationConcept.AREA, 'Area');
  assert.equal(LocationConcept.SERVICE_COVERAGE_REFERENCE, 'Service Coverage Reference');
});

test('country city area hierarchy supports Syria Damascus Al-Midan references', () => {
  assert.deepEqual(APPROVED_COUNTRY_REFERENCES, Object.values(CountryReference));
  assert.deepEqual(APPROVED_CITY_REFERENCES, Object.values(CityReference));
  assert.deepEqual(APPROVED_AREA_REFERENCES, Object.values(AreaReference));
  assert.deepEqual(LocationHierarchy[CountryReference.SYRIA][CityReference.DAMASCUS], [AreaReference.AL_MIDAN]);
  assert.equal(validateLocationHierarchyReference(CountryReference.SYRIA, CityReference.DAMASCUS, AreaReference.AL_MIDAN).valid, true);
  assert.equal(validateLocationHierarchyReference(CountryReference.SYRIA, 'aleppo', AreaReference.AL_MIDAN).valid, false);
});

test('coverage references remain reference-only and prevent delivery or marketplace zones', () => {
  assert.deepEqual(APPROVED_COVERAGE_REFERENCE_TYPES, Object.values(CoverageReferenceType));
  assert.ok(APPROVED_COVERAGE_REFERENCE_TYPES.includes(CoverageReferenceType.BUSINESS_LOCATION));
  assert.ok(APPROVED_COVERAGE_REFERENCE_TYPES.includes(CoverageReferenceType.PROFESSIONAL_LOCATION));
  assert.ok(APPROVED_COVERAGE_REFERENCE_TYPES.includes(CoverageReferenceType.ORGANIZATION_LOCATION));
  assert.ok(APPROVED_COVERAGE_REFERENCE_TYPES.includes(CoverageReferenceType.SERVICE_COVERAGE_AREA));
  assert.ok(APPROVED_COVERAGE_REFERENCE_TYPES.includes(CoverageReferenceType.PARTNER_COVERAGE_REFERENCE));
  assert.equal(LocationCoverageBoundary.SERVICE_COVERAGE_AREA_REFERENCE_ONLY, 'service_coverage_area_reference_only');
  assert.equal(ForbiddenLocationCoverageRule.DELIVERY_ZONE_IMPLEMENTATION, 'delivery_zone_implementation');
  const invalid = validateCoverageReference({ coverageType: CoverageReferenceType.SERVICE_COVERAGE_AREA, reference: 'service_coverage_area:001', locationOwnsBusiness: true, locationOwnsService: true, marketplaceZoneRef: 'marketplace:zone', deliveryZoneRef: 'delivery:zone' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'LOCATION_OWNERSHIP_INVALID'));
});

test('ownership boundaries keep locations as geographic references only', () => {
  assert.equal(validateLocationOwnershipReference(validLocation.ownershipRef).valid, true);
  assert.equal(LocationOwnershipBoundary.LOCATION_PROVIDES_GEOGRAPHIC_REFERENCE_ONLY, 'location_provides_geographic_reference_only');
  assert.equal(ForbiddenLocationOwnershipRule.LOCATION_OWNERSHIP, 'location_ownership');
  const invalid = validateLocationOwnershipReference({ ownerReferenceType: 'location', ownerRef: 'location_identity:001', locationOwnerRef: 'location:owner', locationOwnsEntity: true, duplicateLocationOwnership: true, transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.every((error) => error.code === 'LOCATION_OWNERSHIP_INVALID'));
});

test('visibility rules define public private internal classes and prevent private address exposure', () => {
  assert.deepEqual(APPROVED_LOCATION_VISIBILITIES, Object.values(LocationVisibility));
  assert.ok(LocationVisibilityClass.public.includes('countryName'));
  assert.ok(LocationVisibilityClass.public.includes('cityName'));
  assert.ok(LocationVisibilityClass.public.includes('areaName'));
  assert.ok(LocationVisibilityClass.private.includes('privateAddressRef'));
  assert.ok(LocationVisibilityClass.internal.includes('operationalMetadataRef'));
  assert.equal(validateLocationVisibilityExposure({ visibility: LocationVisibility.PUBLIC, fieldClass: LocationVisibility.PUBLIC }).valid, true);
  assert.equal(validateLocationVisibilityExposure({ visibility: LocationVisibility.PUBLIC, fieldClass: LocationVisibility.PRIVATE }).valid, false);
  assert.equal(validateLocationVisibilityExposure({ visibility: LocationVisibility.PUBLIC, exposesPrivateAddress: true }).valid, false);
});

test('lifecycle compatibility reuses Created Pending Active Suspended Archived states', () => {
  assert.deepEqual(APPROVED_LOCATION_STATUSES, Object.values(LocationStatus));
  assert.equal(canTransitionLocationLifecycle(LocationStatus.CREATED, LocationStatus.PENDING), true);
  assert.equal(canTransitionLocationLifecycle(LocationStatus.PENDING, LocationStatus.ACTIVE), true);
  assert.equal(canTransitionLocationLifecycle(LocationStatus.ACTIVE, LocationStatus.SUSPENDED), true);
  assert.equal(canTransitionLocationLifecycle(LocationStatus.SUSPENDED, LocationStatus.ACTIVE), true);
  assert.equal(canTransitionLocationLifecycle(LocationStatus.ACTIVE, LocationStatus.ARCHIVED), true);
  assert.equal(canTransitionLocationLifecycle(LocationStatus.ARCHIVED, LocationStatus.ACTIVE), false);
  assert.equal(validateLocationLifecycleTransition(LocationStatus.CREATED, LocationStatus.ACTIVE).valid, false);
});

test('validation checks identity type hierarchy references visibility status coverage and ownership only', () => {
  assert.equal(validateLocationFoundation(validLocation).valid, true);
  const invalid = validateLocationFoundation({ locationIdentityRef: 'location:001', locationType: 'gps_point', country: CountryReference.SYRIA, city: 'aleppo', area: AreaReference.AL_MIDAN, countryRef: 'nation:syria', cityRef: 'town:damascus', areaRef: 'district:midan', coverageRef: { coverageType: 'delivery_zone', reference: 'delivery_zone:001' }, visibility: 'public', status: 'tracking', ownershipRef: { ownerReferenceType: 'location', ownerRef: 'location:001' } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'locationIdentityRef'));
  assert.ok(invalid.errors.some((error) => error.code === 'LOCATION_HIERARCHY_INVALID'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.ownerReferenceType'));
});

test('location errors are compatible with Mission 052 core errors', () => {
  const invalid = createLocationError(LocationErrorCode.LOCATION_INVALID, 'Invalid location.');
  const duplicate = createLocationError(LocationErrorCode.LOCATION_DUPLICATE, 'Duplicate location.');
  const ownership = createLocationError(LocationErrorCode.LOCATION_OWNERSHIP_INVALID, 'Invalid location ownership.');
  const lifecycle = createLocationError(LocationErrorCode.LOCATION_LIFECYCLE_INVALID, 'Invalid location lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('audit compatibility defines future event constants only', () => {
  assert.equal(LocationAuditEvent.LOCATION_CREATED, 'LOCATION_CREATED');
  assert.equal(LocationAuditEvent.LOCATION_UPDATED, 'LOCATION_UPDATED');
  assert.equal(LocationAuditEvent.LOCATION_STATUS_CHANGED, 'LOCATION_STATUS_CHANGED');
  assert.equal(LocationAuditEvent.LOCATION_ARCHIVED, 'LOCATION_ARCHIVED');
  assert.equal(LocationAuditEvent.LOCATION_HIERARCHY_CHANGED, 'LOCATION_HIERARCHY_CHANGED');
  assert.ok(Object.values(LocationAuditEvent).every(isLocationAuditEventName));
});

test('dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/locations/domain/location-types.mjs',
    'backend/modules/locations/domain/coverage.mjs',
    'backend/modules/locations/domain/ownership.mjs',
    'backend/modules/locations/domain/visibility.mjs',
    'backend/modules/locations/domain/lifecycle.mjs',
    'backend/modules/locations/domain/errors.mjs',
    'backend/modules/locations/domain/audit-events.mjs',
    'backend/modules/locations/domain/security-policy.mjs',
    'backend/modules/locations/schemas/location-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|business_profiles|professional_profiles|organizations|service_catalog|trust_verification|relationships|analytics|payments|marketplace|frontend|apps\/backend)/);
  assert.doesNotMatch(content, /controller|route|migration|ORM model|database connection|maps integration|GPS tracking/i);
});

test('security boundaries expose no private addresses GPS history tracking data tokens credentials or secrets', () => {
  assert.equal(LocationSecurityPolicy.storesPrivateAddresses, false);
  assert.equal(LocationSecurityPolicy.storesGpsHistory, false);
  assert.equal(LocationSecurityPolicy.storesTrackingData, false);
  assert.equal(LocationSecurityPolicy.storesTokensCredentialsOrSecrets, false);
  assert.deepEqual(assertNoLocationSensitiveExposure({ locationIdentityRef: 'location_identity:001' }), { valid: true, exposed: [] });
  assert.equal(assertNoLocationSensitiveExposure({ privateAddressRef: 'never', gpsHistory: 'never', trackingData: 'never', accessToken: 'never' }).valid, false);
});

test('location foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/locations/README.md');
  assert.match(readme, /GPS tracking/);
  assert.match(readme, /driver tracking/);
  assert.match(readme, /delivery marketplace/);
  assert.match(readme, /logistics engine/);
  assert.match(readme, /route optimization/);
  assert.match(readme, /location advertising/);
  assert.match(readme, /location ranking/);
  assert.match(readme, /surveillance systems/);
  assert.match(readme, /personal movement tracking/);
});
