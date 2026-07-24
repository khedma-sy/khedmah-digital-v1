export const UserPrivacyBoundary = Object.freeze({
  public: Object.freeze([
    'display_identity',
    'public_profile_reference',
  ]),
  private: Object.freeze([
    'private_account_information',
    'personal_contact_references',
  ]),
  internal: Object.freeze([
    'security_metadata',
    'operational_metadata',
  ]),
  protections: Object.freeze([
    'do_not_expose_private_data',
    'do_not_log_sensitive_information',
    'do_not_leak_identity_attributes',
  ]),
});

export function assertUserPublicPayloadBoundary(payload) {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  const forbidden = ['email', 'phone', 'password', 'token', 'secret', 'credential', 'securitymetadata', 'operationalmetadata'];
  const exposed = forbidden.filter((word) => serialized.includes(word));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
