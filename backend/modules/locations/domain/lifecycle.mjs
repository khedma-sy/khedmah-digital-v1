import { LocationStatus } from './location-types.mjs';

export const LOCATION_LIFECYCLE_TRANSITIONS = Object.freeze({
  [LocationStatus.CREATED]: Object.freeze([LocationStatus.PENDING, LocationStatus.ARCHIVED]),
  [LocationStatus.PENDING]: Object.freeze([LocationStatus.ACTIVE, LocationStatus.SUSPENDED, LocationStatus.ARCHIVED]),
  [LocationStatus.ACTIVE]: Object.freeze([LocationStatus.SUSPENDED, LocationStatus.ARCHIVED]),
  [LocationStatus.SUSPENDED]: Object.freeze([LocationStatus.ACTIVE, LocationStatus.ARCHIVED]),
  [LocationStatus.ARCHIVED]: Object.freeze([]),
});

export function canTransitionLocationLifecycle(fromStatus, toStatus) {
  return Boolean(LOCATION_LIFECYCLE_TRANSITIONS[fromStatus]?.includes(toStatus));
}

export function validateLocationLifecycleTransition(fromStatus, toStatus) {
  const valid = canTransitionLocationLifecycle(fromStatus, toStatus);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'status', code: 'LOCATION_LIFECYCLE_INVALID', message: `Location cannot transition from ${fromStatus} to ${toStatus}.` }]) });
}
