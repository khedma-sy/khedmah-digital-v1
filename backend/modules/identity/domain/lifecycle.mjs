import { AccountStatus } from './identity-types.mjs';

export const IDENTITY_LIFECYCLE_ORDER = Object.freeze([
  AccountStatus.CREATED,
  AccountStatus.PENDING,
  AccountStatus.ACTIVE,
  AccountStatus.SUSPENDED,
  AccountStatus.ARCHIVED,
]);

export const ALLOWED_IDENTITY_TRANSITIONS = Object.freeze({
  [AccountStatus.CREATED]: Object.freeze([AccountStatus.PENDING, AccountStatus.ARCHIVED]),
  [AccountStatus.PENDING]: Object.freeze([AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.ARCHIVED]),
  [AccountStatus.ACTIVE]: Object.freeze([AccountStatus.SUSPENDED, AccountStatus.ARCHIVED]),
  [AccountStatus.SUSPENDED]: Object.freeze([AccountStatus.ACTIVE, AccountStatus.ARCHIVED]),
  [AccountStatus.ARCHIVED]: Object.freeze([]),
});

export function isIdentityLifecycleState(value) {
  return IDENTITY_LIFECYCLE_ORDER.includes(value);
}

export function canTransitionIdentityLifecycle(from, to) {
  return Boolean(ALLOWED_IDENTITY_TRANSITIONS[from]?.includes(to));
}

export function validateIdentityLifecycleTransition(from, to) {
  const errors = [];
  if (!isIdentityLifecycleState(from)) errors.push({ field: 'from', code: 'INVALID_LIFECYCLE_STATE', message: 'from must be an approved identity lifecycle state.' });
  if (!isIdentityLifecycleState(to)) errors.push({ field: 'to', code: 'INVALID_LIFECYCLE_STATE', message: 'to must be an approved identity lifecycle state.' });
  if (errors.length === 0 && !canTransitionIdentityLifecycle(from, to)) {
    errors.push({ field: 'transition', code: 'INVALID_LIFECYCLE_TRANSITION', message: 'identity lifecycle transition is not allowed.' });
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
