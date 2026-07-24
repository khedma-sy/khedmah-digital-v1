import { TrustVisibility } from './trust-types.mjs';

export const TrustVisibilityClass = Object.freeze({
  public: Object.freeze(['verificationStatusRef', 'trustLevelRef']),
  private: Object.freeze(['verificationDetailsRef', 'privateEvidenceRef']),
  internal: Object.freeze(['moderationMetadataRef', 'reviewQueueRef', 'auditCorrelationRef']),
});

export function validateTrustVisibilityExposure({ visibility, fieldClass, exposesPrivateEvidence = false, exposesInternalData = false } = {}) {
  const errors = [];
  if (!Object.values(TrustVisibility).includes(visibility)) errors.push({ field: 'visibility', code: 'TRUST_VISIBILITY_INVALID', message: 'Trust visibility is unsupported.' });
  if (visibility === TrustVisibility.PUBLIC && (fieldClass === TrustVisibility.PRIVATE || fieldClass === TrustVisibility.INTERNAL || exposesPrivateEvidence || exposesInternalData)) errors.push({ field: 'visibility', code: 'TRUST_VISIBILITY_INVALID', message: 'Public trust exposure must not reveal private evidence or internal moderation data.' });
  if (visibility === TrustVisibility.PRIVATE && (fieldClass === TrustVisibility.INTERNAL || exposesInternalData)) errors.push({ field: 'visibility', code: 'TRUST_VISIBILITY_INVALID', message: 'Private trust exposure must not reveal internal moderation metadata.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
