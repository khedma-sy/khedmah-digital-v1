import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { OWNERSHIP_REFERENCE_PATTERN, RELATIONSHIP_ENTITY_REFERENCE_PATTERN, RELATIONSHIP_RECORD_REFERENCE_PATTERN, REQUIRED_RELATIONSHIP_FIELDS, RelationshipEntityReferenceType, RelationshipScope, RelationshipStatus, RelationshipType, RelationshipVisibility } from '../domain/relationship-types.mjs';
import { validateRelationshipOwnershipBoundary } from '../domain/ownership.mjs';

const relationshipEntityReferenceTypes = Object.freeze(Object.values(RelationshipEntityReferenceType));
const relationshipScopes = Object.freeze(Object.values(RelationshipScope));
const relationshipStatuses = Object.freeze(Object.values(RelationshipStatus));
const relationshipTypes = Object.freeze(Object.values(RelationshipType));
const relationshipVisibilities = Object.freeze(Object.values(RelationshipVisibility));

export function validateRelationshipReferencePair(value = {}) {
  const errors = [];
  if (!relationshipEntityReferenceTypes.includes(value.subjectType)) errors.push({ field: 'subjectType', code: 'RELATIONSHIP_INVALID', message: 'Relationship subject type is unsupported.' });
  if (!relationshipEntityReferenceTypes.includes(value.targetType)) errors.push({ field: 'targetType', code: 'RELATIONSHIP_INVALID', message: 'Relationship target type is unsupported.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateRelationshipFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_RELATIONSHIP_FIELDS),
    validateAllowedValue('relationshipType', value.relationshipType, relationshipTypes),
    validateAllowedValue('relationshipStatus', value.relationshipStatus, relationshipStatuses),
    validateAllowedValue('subjectType', value.subjectType, relationshipEntityReferenceTypes),
    validateAllowedValue('targetType', value.targetType, relationshipEntityReferenceTypes),
    validateAllowedValue('relationshipScope', value.relationshipScope, relationshipScopes),
    validateAllowedValue('visibility', value.visibility, relationshipVisibilities),
    validatePattern('relationshipRecordRef', value.relationshipRecordRef, RELATIONSHIP_RECORD_REFERENCE_PATTERN, 'relationshipRecordRef must be a safe relationship record reference.'),
    validatePattern('subjectRef', value.subjectRef, RELATIONSHIP_ENTITY_REFERENCE_PATTERN, 'subjectRef must be a safe relationship entity reference.'),
    validatePattern('targetRef', value.targetRef, RELATIONSHIP_ENTITY_REFERENCE_PATTERN, 'targetRef must be a safe relationship entity reference.'),
    validatePattern('ownershipRef', value.ownershipRef, OWNERSHIP_REFERENCE_PATTERN, 'ownershipRef must be a safe ownership reference.'),
    validateRelationshipReferencePair(value),
    validateRelationshipOwnershipBoundary(value),
  );
}

export { relationshipEntityReferenceTypes as APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES, relationshipScopes as APPROVED_RELATIONSHIP_SCOPES, relationshipStatuses as APPROVED_RELATIONSHIP_STATUSES, relationshipTypes as APPROVED_RELATIONSHIP_TYPES, relationshipVisibilities as APPROVED_RELATIONSHIP_VISIBILITIES };
