export const TrustVerificationAuditEvent = Object.freeze({
  TRUST_CREATED: 'TRUST_CREATED',
  TRUST_UPDATED: 'TRUST_UPDATED',
  VERIFICATION_STATUS_CHANGED: 'VERIFICATION_STATUS_CHANGED',
  TRUST_SUSPENDED: 'TRUST_SUSPENDED',
  TRUST_EXPIRED: 'TRUST_EXPIRED',
});

export function isTrustVerificationAuditEventName(value) {
  return Object.values(TrustVerificationAuditEvent).includes(value);
}
