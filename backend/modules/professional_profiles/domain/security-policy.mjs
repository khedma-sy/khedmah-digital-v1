export const ProfessionalProfileSecurityPolicy = Object.freeze({
  storesSecretsOrCredentials: false,
  storesCertificates: false,
  storesPrivateProfessionalDocuments: false,
  privacyRules: Object.freeze([
    'public_professional_fields_must_not_include_private_contact_references',
    'verification_evidence_is_outside_professional_profile_foundation',
    'operational_metadata_is_internal_reference_only',
  ]),
  forbiddenSensitiveTerms: Object.freeze(['password', 'token', 'secret', 'credential', 'certificate', 'privateProfessionalDocument']),
});

export function assertNoProfessionalSensitiveExposure(payload) {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  const exposed = ProfessionalProfileSecurityPolicy.forbiddenSensitiveTerms.filter((word) => serialized.includes(word.toLowerCase()));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
