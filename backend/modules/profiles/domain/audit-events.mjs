export const ProfileAuditEvent = Object.freeze({
  PROFILE_CREATED: 'PROFILE_CREATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  PROFILE_STATUS_CHANGED: 'PROFILE_STATUS_CHANGED',
  PROFILE_ARCHIVED: 'PROFILE_ARCHIVED',
  PROFILE_OWNERSHIP_CHANGED: 'PROFILE_OWNERSHIP_CHANGED',
});

export function isProfileAuditEventName(value) {
  return Object.values(ProfileAuditEvent).includes(value) && /^[A-Z][A-Z0-9_]+$/.test(value);
}
