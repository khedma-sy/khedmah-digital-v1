export const ProfileSecurityPolicy = Object.freeze({
  storesSecretsOrCredentials: false,
  storesPrivateUserData: false,
  privacyRules: Object.freeze([
    'public_profile_fields_must_not_include_private_or_internal_references',
    'profile_identity_reference_is_required_without_exposing_account_credentials',
    'security_and_operational_metadata_are_internal_references_only',
  ]),
  forbiddenSensitiveTerms: Object.freeze(['password', 'token', 'secret', 'credential']),
});

export function assertNoProfileSensitiveExposure(payload) {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  const exposed = ProfileSecurityPolicy.forbiddenSensitiveTerms.filter((word) => serialized.includes(word));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
