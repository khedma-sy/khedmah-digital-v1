import { ALLOWED_PROFILE_TRANSITIONS, PROFILE_LIFECYCLE_ORDER } from '../../profiles/domain/lifecycle.mjs';
import { ProfessionalStatus } from './professional-types.mjs';

export const PROFESSIONAL_LIFECYCLE_ORDER = Object.freeze([...PROFILE_LIFECYCLE_ORDER]);
export const ALLOWED_PROFESSIONAL_TRANSITIONS = ALLOWED_PROFILE_TRANSITIONS;

export function isProfessionalLifecycleState(value) {
  return PROFESSIONAL_LIFECYCLE_ORDER.includes(value);
}

export function canTransitionProfessionalLifecycle(from, to) {
  return Boolean(ALLOWED_PROFESSIONAL_TRANSITIONS[from]?.includes(to));
}

export function validateProfessionalLifecycleTransition(from, to) {
  const errors = [];
  if (!isProfessionalLifecycleState(from)) errors.push({ field: 'from', code: 'PROFESSIONAL_LIFECYCLE_INVALID', message: 'from must be an approved professional lifecycle state.' });
  if (!isProfessionalLifecycleState(to)) errors.push({ field: 'to', code: 'PROFESSIONAL_LIFECYCLE_INVALID', message: 'to must be an approved professional lifecycle state.' });
  if (errors.length === 0 && !canTransitionProfessionalLifecycle(from, to)) errors.push({ field: 'transition', code: 'PROFESSIONAL_LIFECYCLE_INVALID', message: 'professional lifecycle transition is not allowed.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export { ProfessionalStatus };
