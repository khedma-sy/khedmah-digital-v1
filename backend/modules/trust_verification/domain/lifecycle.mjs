import { TrustStatus } from './trust-types.mjs';

export const TRUST_STATUS_TRANSITIONS = Object.freeze({
  [TrustStatus.UNKNOWN]: Object.freeze([TrustStatus.PENDING, TrustStatus.EXPIRED]),
  [TrustStatus.PENDING]: Object.freeze([TrustStatus.VERIFIED, TrustStatus.REJECTED, TrustStatus.SUSPENDED, TrustStatus.EXPIRED]),
  [TrustStatus.VERIFIED]: Object.freeze([TrustStatus.SUSPENDED, TrustStatus.EXPIRED]),
  [TrustStatus.REJECTED]: Object.freeze([TrustStatus.PENDING, TrustStatus.EXPIRED]),
  [TrustStatus.SUSPENDED]: Object.freeze([TrustStatus.PENDING, TrustStatus.EXPIRED]),
  [TrustStatus.EXPIRED]: Object.freeze([TrustStatus.PENDING]),
});

export function canTransitionTrustStatus(fromStatus, toStatus) {
  return Boolean(TRUST_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus));
}

export function validateTrustLifecycleTransition(fromStatus, toStatus) {
  const valid = canTransitionTrustStatus(fromStatus, toStatus);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'trustStatus', code: 'TRUST_STATUS_INVALID', message: `Trust cannot transition from ${fromStatus} to ${toStatus}.` }]) });
}
