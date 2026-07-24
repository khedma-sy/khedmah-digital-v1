export const BusinessProfileSecurityPolicy = Object.freeze({
  storesSecretsOrCredentials: false,
  storesFinancialData: false,
  storesPaymentData: false,
  privacyRules: Object.freeze([
    'public_business_fields_must_not_include_private_contact_references',
    'verification_evidence_is_outside_business_profile_foundation',
    'financial_and_payment_data_are_forbidden_in_business_profile_foundation',
    'operational_metadata_is_internal_reference_only',
  ]),
  forbiddenSensitiveTerms: Object.freeze(['password', 'token', 'secret', 'credential', 'financialData', 'paymentData']),
});

export function assertNoBusinessSensitiveExposure(payload) {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  const exposed = BusinessProfileSecurityPolicy.forbiddenSensitiveTerms.filter((word) => serialized.includes(word.toLowerCase()));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
