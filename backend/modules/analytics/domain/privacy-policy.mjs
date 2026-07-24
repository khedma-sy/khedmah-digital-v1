export const AnalyticsPrivacyRule = Object.freeze({
  allowsAggregatedStatistics: true,
  allowsAnonymousPatterns: true,
  allowsGeneralDemandTrends: true,
  forbidsIndividualUserTracking: true,
  forbidsPersonalBehaviorProfiles: true,
  forbidsSellingUserData: true,
  forbidsSurveillance: true,
  forbidsPrivateActivityExposure: true,
  storesPrivateUserData: false,
  storesTrackingIdentifiers: false,
  storesSecretsTokensCredentials: false,
});

export const forbiddenAnalyticsFields = Object.freeze(['userId', 'accountId', 'profileId', 'sessionId', 'deviceId', 'trackingId', 'ipAddress', 'email', 'phone', 'password', 'token', 'secret', 'credential', 'privateActivity', 'personalProfile']);

export function validateAnalyticsPrivacySafety(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenAnalyticsFields.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed), errors: Object.freeze(exposed.map((field) => ({ field, code: 'ANALYTICS_PRIVATE_FIELD_FORBIDDEN', message: `${field} must not be stored in analytics foundations.` }))) });
}
