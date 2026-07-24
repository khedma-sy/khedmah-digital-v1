export const RelationshipSecurityPolicy = Object.freeze({
  preventsPrivateOwnershipLeakage: true,
  preventsUnauthorizedRelationshipChanges: true,
  preventsSensitiveIdentityExposure: true,
  preventsHiddenOwnershipConflicts: true,
  storesPasswordsTokensCredentialsSecrets: false,
  storesPrivateUserData: false,
  missionScope: 'relationship_references_and_ownership_associations_only',
});

const forbiddenSensitiveFields = Object.freeze(['password', 'token', 'credential', 'secret', 'privateUserData', 'identitySecret', 'privateOwnershipEvidence']);

export function assertNoRelationshipSensitiveExposure(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenSensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
