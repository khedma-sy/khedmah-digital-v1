export const TrustVerificationSecurityPolicy = Object.freeze({
  storesIdentityDocuments: false,
  storesCertificates: false,
  storesPasswordsTokensOrSecrets: false,
  storesPrivateEvidence: false,
  exposesPrivateEvidencePublicly: false,
  missionScope: 'trust_references_and_reputation_safety_only',
});

const forbiddenSensitiveFields = Object.freeze(['identityDocument', 'certificate', 'password', 'token', 'secret', 'privateEvidence', 'documentUpload', 'approvalWorkflow']);

export function assertNoTrustSensitiveExposure(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenSensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed) });
}
