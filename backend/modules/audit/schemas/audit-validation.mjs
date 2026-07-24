import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { AuditEvent, isAuditEventName } from '../domain/audit-events.mjs';
import { AuditAction, AuditResult, AUDIT_REFERENCE_PATTERN, REQUIRED_AUDIT_FIELDS, REQUIRED_AUDIT_METADATA_FIELDS } from '../domain/audit-types.mjs';
import { validateAuditMetadataSafety } from '../domain/metadata-policy.mjs';

const auditActions = Object.freeze(Object.values(AuditAction));
const auditResults = Object.freeze(Object.values(AuditResult));
const auditEvents = Object.freeze(Object.values(AuditEvent));

export function validateAuditEventName(value) {
  const valid = isAuditEventName(value);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'eventName', code: 'AUDIT_EVENT_INVALID', message: 'Audit event name must be an approved UPPERCASE_SNAKE_CASE resource action.' }]) });
}

export function validateAuditMetadata(value = {}) {
  return combineValidationResults(validateRequiredFields(value, REQUIRED_AUDIT_METADATA_FIELDS), validatePattern('previousStateRef', value.previousStateRef, AUDIT_REFERENCE_PATTERN), validatePattern('newStateRef', value.newStateRef, AUDIT_REFERENCE_PATTERN), validateAuditMetadataSafety(value));
}

export function validateAuditFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_AUDIT_FIELDS),
    validateAuditEventName(value.eventName),
    validateAllowedValue('action', value.action, auditActions),
    validateAllowedValue('result', value.result, auditResults),
    validatePattern('actorRef', value.actorRef, AUDIT_REFERENCE_PATTERN),
    validatePattern('resourceRef', value.resourceRef, AUDIT_REFERENCE_PATTERN),
    validateAuditMetadata(value.metadata || {}),
  );
}

export { auditActions as APPROVED_AUDIT_ACTIONS, auditEvents as APPROVED_AUDIT_EVENTS, auditResults as APPROVED_AUDIT_RESULTS };
