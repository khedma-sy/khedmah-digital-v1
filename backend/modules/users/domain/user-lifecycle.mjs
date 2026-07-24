import { ALLOWED_IDENTITY_TRANSITIONS, canTransitionIdentityLifecycle, validateIdentityLifecycleTransition } from '../../identity/domain/lifecycle.mjs';

export const USER_LIFECYCLE_COMPATIBILITY = Object.freeze({
  source: 'Mission 053 Identity Module Foundation',
  allowedTransitionsReference: ALLOWED_IDENTITY_TRANSITIONS,
  forbiddenTransitionsReference: 'Any transition not present in allowedTransitionsReference is forbidden for user accounts.',
  workflowEngineImplemented: false,
});

export function canTransitionUserLifecycle(from, to) {
  return canTransitionIdentityLifecycle(from, to);
}

export function validateUserLifecycleTransition(from, to) {
  return validateIdentityLifecycleTransition(from, to);
}
