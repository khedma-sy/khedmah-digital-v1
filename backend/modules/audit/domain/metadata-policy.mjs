export const AuditMetadataRule = Object.freeze({
  includesActorReference: true,
  includesAction: true,
  includesResourceReference: true,
  includesPreviousStateReference: true,
  includesNewStateReference: true,
  includesTimestamp: true,
  includesReason: true,
  storesPasswordsTokensSecretsCredentials: false,
  storesPrivateDocuments: false,
  storesSensitivePersonalInformation: false,
});

export const forbiddenAuditMetadataFields = Object.freeze(['password', 'passcode', 'token', 'secret', 'credential', 'privateDocument', 'documentUpload', 'identityDocument', 'sensitivePersonalInformation', 'ssn', 'nationalId', 'passport', 'biometric']);

export function validateAuditMetadataSafety(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenAuditMetadataFields.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed), errors: Object.freeze(exposed.map((field) => ({ field, code: 'AUDIT_METADATA_SENSITIVE_FIELD', message: `${field} must not be stored in audit metadata.` }))) });
}
