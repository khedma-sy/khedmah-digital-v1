export const LocationSecurityPolicy = Object.freeze({
  storesPrivateAddresses: false,
  storesGpsHistory: false,
  storesTrackingData: false,
  storesTokensCredentialsOrSecrets: false,
  exposesPrivateAddressesPublicly: false,
  missionScope: 'location_identity_hierarchy_and_coverage_references_only',
});

const forbiddenSensitiveFields = Object.freeze(['privateAddress', 'gpsHistory', 'trackingData', 'token', 'credential', 'secret', 'password', 'latitude', 'longitude']);

export function assertNoLocationSensitiveExposure(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenSensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
