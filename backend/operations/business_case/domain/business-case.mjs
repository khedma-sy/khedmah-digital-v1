import { BusinessCaseErrorCode, BusinessCaseValidationError } from './business-case-errors.mjs';
import { BusinessCaseState, canTransitionBusinessCase } from './business-case-lifecycle.mjs';

export const BusinessCaseEvent = Object.freeze({
  CREATED: 'BUSINESS_CASE_CREATED',
  REGISTRATION_ATTACHED: 'REGISTRATION_ATTACHED',
  VERIFICATION_ATTACHED: 'VERIFICATION_ATTACHED',
  DECISION_ATTACHED: 'DECISION_ATTACHED',
  STATE_CHANGED: 'BUSINESS_CASE_STATE_CHANGED',
});

const requiredText = (value, field, code = BusinessCaseErrorCode.INVALID_CASE) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BusinessCaseValidationError(code, `${field} is required.`, { field });
  }
  return value.trim();
};

const freezeCase = (value) => Object.freeze({
  ...value,
  ownership: Object.freeze({ ...value.ownership }),
  references: Object.freeze({ ...value.references }),
  relatedCaseIdentifiers: Object.freeze([...(value.relatedCaseIdentifiers ?? [])]),
  timeline: Object.freeze(value.timeline.map((event) => Object.freeze({ ...event }))),
  auditRecords: Object.freeze(value.auditRecords.map((record) => Object.freeze({ ...record }))),
});

const event = (caseRecord, type, at, data = {}) => ({
  eventIdentifier: `${caseRecord.caseIdentifier}:${caseRecord.version + 1}:${type}`,
  type,
  at: requiredText(at, 'at'),
  caseIdentifier: caseRecord.caseIdentifier,
  correlationId: caseRecord.correlationId,
  policyReference: caseRecord.ownership.governingPolicyReference,
  ...data,
});

const revise = (caseRecord, timelineEvent, changes = {}) => freezeCase({
  ...caseRecord,
  ...changes,
  version: caseRecord.version + 1,
  updatedAt: timelineEvent.at,
  timeline: [...caseRecord.timeline, timelineEvent],
  auditRecords: [...caseRecord.auditRecords, {
    auditRecordIdentifier: `audit:${timelineEvent.eventIdentifier}`,
    eventIdentifier: timelineEvent.eventIdentifier,
    caseIdentifier: caseRecord.caseIdentifier,
    correlationId: caseRecord.correlationId,
    policyReference: caseRecord.ownership.governingPolicyReference,
    recordedAt: timelineEvent.at,
  }],
});

export function createBusinessCase(input, { existingCaseIdentifiers = [] } = {}) {
  const caseIdentifier = requiredText(input?.caseIdentifier, 'caseIdentifier');
  if (existingCaseIdentifiers.includes(caseIdentifier)) {
    throw new BusinessCaseValidationError(BusinessCaseErrorCode.DUPLICATE_CASE_ID, 'Case identifier already exists.', { caseIdentifier });
  }
  const responsibleRole = requiredText(input?.responsibleRole, 'responsibleRole', BusinessCaseErrorCode.INVALID_OWNERSHIP);
  const governingPolicyReference = requiredText(input?.governingPolicyReference, 'governingPolicyReference', BusinessCaseErrorCode.INVALID_OWNERSHIP);
  const related = [...(input.relatedCaseIdentifiers ?? [])];
  if (related.includes(caseIdentifier)) {
    throw new BusinessCaseValidationError(BusinessCaseErrorCode.CIRCULAR_REFERENCE, 'A business case cannot reference itself.', { caseIdentifier });
  }
  const createdAt = requiredText(input?.createdAt, 'createdAt');
  const base = {
    caseIdentifier,
    caseType: requiredText(input?.caseType, 'caseType'),
    version: 0,
    state: BusinessCaseState.CREATED,
    ownership: { responsibleRole, governingPolicyReference },
    correlationId: requiredText(input?.correlationId, 'correlationId'),
    references: {},
    relatedCaseIdentifiers: related,
    createdAt,
    updatedAt: createdAt,
    timeline: [],
    auditRecords: [],
  };
  return revise(freezeCase(base), event(base, BusinessCaseEvent.CREATED, createdAt));
}

export function transitionBusinessCase(caseRecord, nextState, at) {
  if (!canTransitionBusinessCase(caseRecord.state, nextState)) {
    throw new BusinessCaseValidationError(BusinessCaseErrorCode.INVALID_TRANSITION, `Cannot transition from ${caseRecord.state} to ${nextState}.`);
  }
  return revise(caseRecord, event(caseRecord, BusinessCaseEvent.STATE_CHANGED, at, { from: caseRecord.state, to: nextState }), { state: nextState });
}

function validateAssociation(caseRecord, association, kind) {
  const reference = requiredText(association?.reference, `${kind}Reference`, BusinessCaseErrorCode.MISSING_REFERENCE);
  if (association.caseIdentifier !== caseRecord.caseIdentifier || association.correlationId !== caseRecord.correlationId) {
    throw new BusinessCaseValidationError(
      kind === 'decision' ? BusinessCaseErrorCode.INVALID_DECISION : BusinessCaseErrorCode.MISSING_REFERENCE,
      `${kind} association does not belong to this business case.`,
    );
  }
  if (association.policyReference !== caseRecord.ownership.governingPolicyReference) {
    throw new BusinessCaseValidationError(kind === 'decision' ? BusinessCaseErrorCode.INVALID_DECISION : BusinessCaseErrorCode.MISSING_REFERENCE, `${kind} policy reference does not match.`);
  }
  return reference;
}

export function attachRegistration(caseRecord, association, at) {
  const reference = validateAssociation(caseRecord, association, 'registration');
  return revise(caseRecord, event(caseRecord, BusinessCaseEvent.REGISTRATION_ATTACHED, at, { reference }), {
    references: { ...caseRecord.references, registration: reference },
  });
}

export function attachVerification(caseRecord, association, at) {
  if (!caseRecord.references.registration) throw new BusinessCaseValidationError(BusinessCaseErrorCode.MISSING_REFERENCE, 'Registration reference must be attached first.');
  const reference = validateAssociation(caseRecord, association, 'verification');
  return revise(caseRecord, event(caseRecord, BusinessCaseEvent.VERIFICATION_ATTACHED, at, { reference }), {
    references: { ...caseRecord.references, verification: reference },
  });
}

export function attachDecision(caseRecord, association, at) {
  if (!caseRecord.references.registration || !caseRecord.references.verification) {
    throw new BusinessCaseValidationError(BusinessCaseErrorCode.INVALID_DECISION, 'Registration and verification references must be attached before a decision.');
  }
  const reference = validateAssociation(caseRecord, association, 'decision');
  if (association.verificationReference !== caseRecord.references.verification) {
    throw new BusinessCaseValidationError(BusinessCaseErrorCode.INVALID_DECISION, 'Decision verification reference does not match the case.');
  }
  return revise(caseRecord, event(caseRecord, BusinessCaseEvent.DECISION_ATTACHED, at, { reference }), {
    references: { ...caseRecord.references, decision: reference },
  });
}

