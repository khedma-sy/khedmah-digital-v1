import { RelationshipStatus } from './relationship-types.mjs';

export const RELATIONSHIP_LIFECYCLE_TRANSITIONS = Object.freeze({
  [RelationshipStatus.CREATED]: Object.freeze([RelationshipStatus.PENDING, RelationshipStatus.ARCHIVED]),
  [RelationshipStatus.PENDING]: Object.freeze([RelationshipStatus.ACTIVE, RelationshipStatus.SUSPENDED, RelationshipStatus.ARCHIVED]),
  [RelationshipStatus.ACTIVE]: Object.freeze([RelationshipStatus.SUSPENDED, RelationshipStatus.ARCHIVED]),
  [RelationshipStatus.SUSPENDED]: Object.freeze([RelationshipStatus.ACTIVE, RelationshipStatus.ARCHIVED]),
  [RelationshipStatus.ARCHIVED]: Object.freeze([]),
});

export function canTransitionRelationshipLifecycle(fromStatus, toStatus) {
  return Boolean(RELATIONSHIP_LIFECYCLE_TRANSITIONS[fromStatus]?.includes(toStatus));
}

export function validateRelationshipLifecycleTransition(fromStatus, toStatus) {
  const valid = canTransitionRelationshipLifecycle(fromStatus, toStatus);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'relationshipStatus', code: 'RELATIONSHIP_LIFECYCLE_INVALID', message: `Relationship cannot transition from ${fromStatus} to ${toStatus}.` }]) });
}
