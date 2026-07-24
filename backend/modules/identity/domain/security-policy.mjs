export const IdentitySecurityPolicy = Object.freeze({
  passwordPolicyRequirements: Object.freeze({
    minimumLength: 12,
    requireNonCommonPassword: true,
    requireRotationOnlyOnRisk: true,
    storePasswordPlaintext: false,
    missionScope: 'documentation_and_rules_only_no_password_storage',
  }),
  credentialProtectionPrinciples: Object.freeze([
    'never_store_plaintext_passwords_or_recovery_secrets',
    'never_log_passwords_tokens_or_private_credentials',
    'never_expose_credential_material_in_errors_or_audit_events',
    'use_future_approved_hashing_and_secret_management_before_authentication_implementation',
  ]),
  sensitiveDataHandlingRules: Object.freeze([
    'classify_identity_contact_and_verification_signals_as_private_or_internal',
    'return_validation_metadata_without_private_identity_values',
    'separate_public_profile_identity_from_private_account_identity',
  ]),
  privacyBoundaries: Object.freeze([
    'identity_foundation_does_not_publish_private_user_data',
    'roles_permissions_and_ownership_are_compatibility_references_only',
    'verification_evidence_is_future_private_audit_compatible_scope_only',
  ]),
});

export function assertNoCredentialExposure(payload) {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  const forbidden = ['password', 'secret', 'token', 'credential'];
  const exposed = forbidden.filter((word) => serialized.includes(word));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
