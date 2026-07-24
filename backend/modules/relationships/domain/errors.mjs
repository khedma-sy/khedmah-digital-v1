import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const RelationshipErrorCode = Object.freeze({
  RELATIONSHIP_INVALID: 'RELATIONSHIP_INVALID',
  RELATIONSHIP_DUPLICATE: 'RELATIONSHIP_DUPLICATE',
  RELATIONSHIP_TYPE_INVALID: 'RELATIONSHIP_TYPE_INVALID',
  RELATIONSHIP_OWNERSHIP_INVALID: 'RELATIONSHIP_OWNERSHIP_INVALID',
  RELATIONSHIP_LIFECYCLE_INVALID: 'RELATIONSHIP_LIFECYCLE_INVALID',
});

const RelationshipErrorCategory = Object.freeze({
  [RelationshipErrorCode.RELATIONSHIP_INVALID]: ErrorCategory.VALIDATION,
  [RelationshipErrorCode.RELATIONSHIP_DUPLICATE]: ErrorCategory.DUPLICATE,
  [RelationshipErrorCode.RELATIONSHIP_TYPE_INVALID]: ErrorCategory.VALIDATION,
  [RelationshipErrorCode.RELATIONSHIP_OWNERSHIP_INVALID]: ErrorCategory.OWNERSHIP,
  [RelationshipErrorCode.RELATIONSHIP_LIFECYCLE_INVALID]: ErrorCategory.LIFECYCLE,
});

export function createRelationshipError(code, message, metadata = {}) {
  return new KhedmahCoreError({ code, message, category: RelationshipErrorCategory[code] || ErrorCategory.SYSTEM, metadata });
}
