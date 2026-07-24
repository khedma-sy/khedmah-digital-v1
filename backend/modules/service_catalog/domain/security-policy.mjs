export const ServiceCatalogSecurityPolicy = Object.freeze({
  storesSecretsOrCredentials: false,
  storesTokensOrPasswords: false,
  storesFinancialData: false,
  storesPaymentData: false,
  exposesPrivateOrInternalReferencesPublicly: false,
  missionScope: 'service_identity_and_taxonomy_only',
});

const forbiddenSensitiveFields = Object.freeze(['secret', 'credential', 'token', 'password', 'cardNumber', 'paymentData', 'financialData']);

export function assertNoServiceSensitiveExposure(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenSensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
