import { ProfileStatus } from './profile-types.mjs';

export const PROFILE_LIFECYCLE_ORDER = Object.freeze([
  ProfileStatus.CREATED,
  ProfileStatus.PENDING,
  ProfileStatus.ACTIVE,
  ProfileStatus.SUSPENDED,
  ProfileStatus.ARCHIVED,
]);

export const ALLOWED_PROFILE_TRANSITIONS = Object.freeze({
  [ProfileStatus.CREATED]: Object.freeze([ProfileStatus.PENDING, ProfileStatus.ARCHIVED]),
  [ProfileStatus.PENDING]: Object.freeze([ProfileStatus.ACTIVE, ProfileStatus.SUSPENDED, ProfileStatus.ARCHIVED]),
  [ProfileStatus.ACTIVE]: Object.freeze([ProfileStatus.SUSPENDED, ProfileStatus.ARCHIVED]),
  [ProfileStatus.SUSPENDED]: Object.freeze([ProfileStatus.ACTIVE, ProfileStatus.ARCHIVED]),
  [ProfileStatus.ARCHIVED]: Object.freeze([]),
});

export function isProfileLifecycleState(value) {
  return PROFILE_LIFECYCLE_ORDER.includes(value);
}

export function canTransitionProfileLifecycle(from, to) {
  return Boolean(ALLOWED_PROFILE_TRANSITIONS[from]?.includes(to));
}

export function validateProfileLifecycleTransition(from, to) {
  const errors = [];
  if (!isProfileLifecycleState(from)) errors.push({ field: 'from', code: 'PROFILE_LIFECYCLE_INVALID', message: 'from must be an approved profile lifecycle state.' });
  if (!isProfileLifecycleState(to)) errors.push({ field: 'to', code: 'PROFILE_LIFECYCLE_INVALID', message: 'to must be an approved profile lifecycle state.' });
  if (errors.length === 0 && !canTransitionProfileLifecycle(from, to)) errors.push({ field: 'transition', code: 'PROFILE_LIFECYCLE_INVALID', message: 'profile lifecycle transition is not allowed.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
