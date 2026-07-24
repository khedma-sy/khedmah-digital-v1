export const IdentityAuditEvent = Object.freeze({
  USER_ACCOUNT_CREATED: 'USER_ACCOUNT_CREATED',
  USER_ACCOUNT_UPDATED: 'USER_ACCOUNT_UPDATED',
  ACCOUNT_STATUS_CHANGED: 'ACCOUNT_STATUS_CHANGED',
  IDENTITY_VERIFICATION_CHANGED: 'IDENTITY_VERIFICATION_CHANGED',
});

export function isIdentityAuditEventName(value) {
  return Object.values(IdentityAuditEvent).includes(value) && /^[A-Z][A-Z0-9_]+$/.test(value);
}
