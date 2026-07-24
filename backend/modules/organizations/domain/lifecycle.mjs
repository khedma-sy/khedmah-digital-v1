import { ALLOWED_PROFILE_TRANSITIONS, PROFILE_LIFECYCLE_ORDER } from '../../profiles/domain/lifecycle.mjs';
import { OrganizationStatus } from './organization-types.mjs';

export const ORGANIZATION_LIFECYCLE_ORDER = Object.freeze([...PROFILE_LIFECYCLE_ORDER]);
export const ALLOWED_ORGANIZATION_TRANSITIONS = ALLOWED_PROFILE_TRANSITIONS;

export function isOrganizationLifecycleState(value) {
  return ORGANIZATION_LIFECYCLE_ORDER.includes(value);
}

export function canTransitionOrganizationLifecycle(from, to) {
  return Boolean(ALLOWED_ORGANIZATION_TRANSITIONS[from]?.includes(to));
}

export function validateOrganizationLifecycleTransition(from, to) {
  const errors = [];
  if (!isOrganizationLifecycleState(from)) errors.push({ field: 'from', code: 'ORGANIZATION_LIFECYCLE_INVALID', message: 'from must be an approved organization lifecycle state.' });
  if (!isOrganizationLifecycleState(to)) errors.push({ field: 'to', code: 'ORGANIZATION_LIFECYCLE_INVALID', message: 'to must be an approved organization lifecycle state.' });
  if (errors.length === 0 && !canTransitionOrganizationLifecycle(from, to)) errors.push({ field: 'transition', code: 'ORGANIZATION_LIFECYCLE_INVALID', message: 'organization lifecycle transition is not allowed.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export { OrganizationStatus };
