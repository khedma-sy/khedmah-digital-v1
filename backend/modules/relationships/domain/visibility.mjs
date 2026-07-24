import { RelationshipVisibility } from './relationship-types.mjs';

export const RelationshipVisibilityClass = Object.freeze({
  public: Object.freeze(['relationshipExistenceRef']),
  private: Object.freeze(['ownershipRef', 'memberRef', 'subjectRef', 'targetRef']),
  internal: Object.freeze(['operationalMetadataRef', 'relationshipGovernanceRef', 'auditCorrelationRef']),
});

export function validateRelationshipVisibilityExposure({ visibility, fieldClass, exposesPrivateRelationship = false, exposesInternalMetadata = false } = {}) {
  const errors = [];
  if (!Object.values(RelationshipVisibility).includes(visibility)) errors.push({ field: 'visibility', code: 'RELATIONSHIP_INVALID', message: 'Relationship visibility is unsupported.' });
  if (visibility === RelationshipVisibility.PUBLIC && (fieldClass === RelationshipVisibility.PRIVATE || fieldClass === RelationshipVisibility.INTERNAL || exposesPrivateRelationship || exposesInternalMetadata)) errors.push({ field: 'visibility', code: 'RELATIONSHIP_INVALID', message: 'Public relationship exposure must not reveal private ownership, member references, or internal metadata.' });
  if (visibility === RelationshipVisibility.PRIVATE && (fieldClass === RelationshipVisibility.INTERNAL || exposesInternalMetadata)) errors.push({ field: 'visibility', code: 'RELATIONSHIP_INVALID', message: 'Private relationship exposure must not reveal internal operational metadata.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
