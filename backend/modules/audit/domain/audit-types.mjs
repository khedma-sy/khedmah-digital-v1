export const AuditConcept = Object.freeze({
  AUDIT_RECORD_REFERENCE: 'Audit Record Reference',
  AUDIT_EVENT: 'Audit Event',
  AUDIT_ACTOR_REFERENCE: 'Audit Actor Reference',
  AUDIT_ACTION: 'Audit Action',
  AUDIT_RESOURCE_REFERENCE: 'Audit Resource Reference',
  AUDIT_RESULT: 'Audit Result',
  AUDIT_METADATA: 'Audit Metadata',
});

export const AuditAction = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  STATUS_CHANGE: 'status_change',
  ARCHIVE: 'archive',
  VERIFY: 'verify',
  LINK: 'link',
});

export const AuditResult = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  REJECTED: 'rejected',
});

export const AuditReferenceType = Object.freeze({
  USER_ACCOUNT: 'user_account',
  PROFILE: 'profile',
  BUSINESS_PROFILE: 'business_profile',
  PROFESSIONAL_PROFILE: 'professional_profile',
  ORGANIZATION: 'organization',
  SERVICE: 'service',
  LOCATION: 'location',
  TRUST: 'trust',
  RELATIONSHIP: 'relationship',
  SYSTEM: 'system',
});

export const AUDIT_EVENT_NAME_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
export const AUDIT_REFERENCE_PATTERN = /^(audit_record|user_account|profile|business_profile|professional_profile|organization|service|location|trust|relationship|system):[a-z0-9][a-z0-9:_-]{1,120}$/;
export const REQUIRED_AUDIT_FIELDS = Object.freeze(['eventName', 'actorRef', 'action', 'resourceRef', 'result', 'metadata']);
export const REQUIRED_AUDIT_METADATA_FIELDS = Object.freeze(['previousStateRef', 'newStateRef', 'timestamp', 'reason']);
