import { ServiceStatus } from './service-types.mjs';

export const SERVICE_LIFECYCLE_TRANSITIONS = Object.freeze({
  [ServiceStatus.CREATED]: Object.freeze([ServiceStatus.PENDING, ServiceStatus.ARCHIVED]),
  [ServiceStatus.PENDING]: Object.freeze([ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED, ServiceStatus.ARCHIVED]),
  [ServiceStatus.ACTIVE]: Object.freeze([ServiceStatus.SUSPENDED, ServiceStatus.ARCHIVED]),
  [ServiceStatus.SUSPENDED]: Object.freeze([ServiceStatus.ACTIVE, ServiceStatus.ARCHIVED]),
  [ServiceStatus.ARCHIVED]: Object.freeze([]),
});

export function canTransitionServiceLifecycle(fromStatus, toStatus) {
  return Boolean(SERVICE_LIFECYCLE_TRANSITIONS[fromStatus]?.includes(toStatus));
}

export function validateServiceLifecycleTransition(fromStatus, toStatus) {
  const valid = canTransitionServiceLifecycle(fromStatus, toStatus);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'status', code: 'SERVICE_LIFECYCLE_INVALID', message: `Service cannot transition from ${fromStatus} to ${toStatus}.` }]) });
}
