export const OrganizationSecurityPolicy = Object.freeze({
  storesSecretsOrCredentials: false,
  storesFinancialInformation: false,
  privacyRules: Object.freeze([
    'public_organization_fields_must_not_include_private_contact_references',
    'membership_references_must_not_expose_employee_hr_or_payroll_data',
    'financial_information_is_forbidden_in_organization_foundation',
    'operational_metadata_is_internal_reference_only',
  ]),
  forbiddenSensitiveTerms: Object.freeze(['password', 'token', 'secret', 'credential', 'financialInformation']),
});

export function assertNoOrganizationSensitiveExposure(payload) {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  const exposed = OrganizationSecurityPolicy.forbiddenSensitiveTerms.filter((word) => serialized.includes(word.toLowerCase()));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
