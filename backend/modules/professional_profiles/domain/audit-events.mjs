export const ProfessionalProfileAuditEvent = Object.freeze({
  PROFESSIONAL_PROFILE_CREATED: 'PROFESSIONAL_PROFILE_CREATED',
  PROFESSIONAL_PROFILE_UPDATED: 'PROFESSIONAL_PROFILE_UPDATED',
  PROFESSIONAL_PROFILE_STATUS_CHANGED: 'PROFESSIONAL_PROFILE_STATUS_CHANGED',
  PROFESSIONAL_PROFILE_ARCHIVED: 'PROFESSIONAL_PROFILE_ARCHIVED',
});

export function isProfessionalProfileAuditEventName(value) {
  return Object.values(ProfessionalProfileAuditEvent).includes(value) && /^[A-Z][A-Z0-9_]+$/.test(value);
}
