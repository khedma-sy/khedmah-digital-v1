export const AuditVisibility = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private',
  INTERNAL: 'internal',
});

export const AuditVisibilityRule = Object.freeze({
  public: Object.freeze([]),
  private: Object.freeze([]),
  internal: Object.freeze(['auditMetadataRef', 'auditCorrelationRef', 'actorReference', 'resourceReference', 'resultReference']),
});

export function validateAuditVisibilityExposure({ visibility, exposesAuditInformation = false, exposesPrivateData = false, exposesOperationalMetadata = false } = {}) {
  const errors = [];
  if (!Object.values(AuditVisibility).includes(visibility)) errors.push({ field: 'visibility', code: 'AUDIT_VISIBILITY_INVALID', message: 'Audit visibility is unsupported.' });
  if (visibility === AuditVisibility.PUBLIC && exposesAuditInformation) errors.push({ field: 'visibility', code: 'AUDIT_LEAKAGE_FORBIDDEN', message: 'Public surfaces must not expose audit information.' });
  if (visibility === AuditVisibility.PRIVATE && exposesAuditInformation) errors.push({ field: 'visibility', code: 'AUDIT_ACCESS_FORBIDDEN', message: 'Private surfaces must not provide direct audit access.' });
  if (exposesPrivateData || exposesOperationalMetadata) errors.push({ field: 'visibility', code: 'AUDIT_METADATA_EXPOSURE_FORBIDDEN', message: 'Audit exposure must not reveal private data or operational metadata.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
