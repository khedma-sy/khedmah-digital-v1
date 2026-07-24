import { ALLOWED_PROFILE_TRANSITIONS, PROFILE_LIFECYCLE_ORDER } from '../../profiles/domain/lifecycle.mjs';
import { BusinessStatus } from './business-types.mjs';

export const BUSINESS_LIFECYCLE_ORDER = Object.freeze([...PROFILE_LIFECYCLE_ORDER]);
export const ALLOWED_BUSINESS_TRANSITIONS = ALLOWED_PROFILE_TRANSITIONS;

export function isBusinessLifecycleState(value) {
  return BUSINESS_LIFECYCLE_ORDER.includes(value);
}

export function canTransitionBusinessLifecycle(from, to) {
  return Boolean(ALLOWED_BUSINESS_TRANSITIONS[from]?.includes(to));
}

export function validateBusinessLifecycleTransition(from, to) {
  const errors = [];
  if (!isBusinessLifecycleState(from)) errors.push({ field: 'from', code: 'BUSINESS_LIFECYCLE_INVALID', message: 'from must be an approved business lifecycle state.' });
  if (!isBusinessLifecycleState(to)) errors.push({ field: 'to', code: 'BUSINESS_LIFECYCLE_INVALID', message: 'to must be an approved business lifecycle state.' });
  if (errors.length === 0 && !canTransitionBusinessLifecycle(from, to)) errors.push({ field: 'transition', code: 'BUSINESS_LIFECYCLE_INVALID', message: 'business lifecycle transition is not allowed.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export { BusinessStatus };
