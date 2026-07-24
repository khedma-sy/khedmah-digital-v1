import { IdentityAuditEvent } from '../../identity/domain/audit-events.mjs';

export const UserAccountAuditEvent = Object.freeze({
  USER_ACCOUNT_CREATED: 'USER_ACCOUNT_CREATED',
  USER_ACCOUNT_UPDATED: 'USER_ACCOUNT_UPDATED',
  USER_ACCOUNT_STATUS_CHANGED: 'USER_ACCOUNT_STATUS_CHANGED',
  USER_ACCOUNT_ARCHIVED: 'USER_ACCOUNT_ARCHIVED',
});

export const USER_IDENTITY_AUDIT_COMPATIBILITY = Object.freeze({
  accountCreated: IdentityAuditEvent.USER_ACCOUNT_CREATED,
  accountUpdated: IdentityAuditEvent.USER_ACCOUNT_UPDATED,
  accountStatusChanged: IdentityAuditEvent.ACCOUNT_STATUS_CHANGED,
});

export function isUserAccountAuditEventName(value) {
  return Object.values(UserAccountAuditEvent).includes(value) && /^USER_ACCOUNT_[A-Z0-9_]+$/.test(value);
}
