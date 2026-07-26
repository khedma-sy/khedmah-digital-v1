import { OperationalStatusErrorCode, OperationalStatusValidationError } from './operational-status-errors.mjs';
import { OperationalStatus, isAuthorizedOperationalStatusTransition, isOperationalStatus } from './operational-status-transitions.mjs';

const requireText = (value, code, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new OperationalStatusValidationError(code, `${field} is required.`, { field });
  return value.trim();
};

const freezeSnapshot = (snapshot) => Object.freeze({
  ...snapshot,
  association: Object.freeze({ ...snapshot.association }),
  relatedStatusIdentifiers: Object.freeze([...snapshot.relatedStatusIdentifiers]),
  history: Object.freeze(snapshot.history.map((entry) => Object.freeze({ ...entry, auditReferences: Object.freeze([...entry.auditReferences]) }))),
  approvalOutcomes: Object.freeze((snapshot.approvalOutcomes ?? []).map((entry) => Object.freeze({ ...entry }))),
  publicationOutcomes: Object.freeze((snapshot.publicationOutcomes ?? []).map((entry) => Object.freeze({ ...entry }))),
});

const historyEntry = (snapshot, previousStatus, currentStatus, transitionTimestamp, transitionEvidenceReference, auditReferences) => Object.freeze({
  sequence: snapshot.version + 1,
  previousStatus,
  currentStatus,
  transitionTimestamp: requireText(transitionTimestamp, OperationalStatusErrorCode.INVALID_TRANSITION, 'transitionTimestamp'),
  transitionEvidenceReference: requireText(transitionEvidenceReference, OperationalStatusErrorCode.INVALID_TRANSITION, 'transitionEvidenceReference'),
  auditReferences: Object.freeze(auditReferences.map((reference) => requireText(reference, OperationalStatusErrorCode.INVALID_TRANSITION, 'auditReference'))),
  statusIdentifier: snapshot.statusIdentifier,
  businessCaseReference: snapshot.association.businessCaseReference,
  decisionReference: snapshot.association.currentDecisionReference,
  correlationIdentifier: snapshot.correlationIdentifier,
});

export function createOperationalStatus(input, { existingStatusIdentifiers = [] } = {}) {
  const statusIdentifier = requireText(input?.statusIdentifier, OperationalStatusErrorCode.INVALID_STATUS, 'statusIdentifier');
  if (existingStatusIdentifiers.includes(statusIdentifier)) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.DUPLICATE_STATUS_ID, 'Operational Status identifier already exists.', { statusIdentifier });
  }
  if (input?.currentStatus !== undefined && input.currentStatus !== OperationalStatus.CREATED) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.INVALID_STATUS, 'An Operational Status must be created in CREATED.');
  }
  const businessCaseReference = requireText(input?.businessCaseReference, OperationalStatusErrorCode.MISSING_BUSINESS_CASE, 'businessCaseReference');
  const currentDecisionReference = requireText(input?.currentDecisionReference, OperationalStatusErrorCode.MISSING_DECISION, 'currentDecisionReference');
  const governingPolicyReference = requireText(input?.governingPolicyReference, OperationalStatusErrorCode.MISSING_POLICY, 'governingPolicyReference');
  const responsibleRole = requireText(input?.responsibleRole, OperationalStatusErrorCode.MISSING_ROLE, 'responsibleRole');
  const relatedStatusIdentifiers = [...(input.relatedStatusIdentifiers ?? [])];
  if ([businessCaseReference, currentDecisionReference, ...relatedStatusIdentifiers].includes(statusIdentifier)) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.CIRCULAR_REFERENCE, 'Operational Status cannot reference itself.', { statusIdentifier });
  }
  const base = {
    statusIdentifier,
    version: 0,
    currentStatus: OperationalStatus.CREATED,
    association: { businessCaseReference, currentDecisionReference, governingPolicyReference, responsibleRole },
    correlationIdentifier: requireText(input?.correlationIdentifier, OperationalStatusErrorCode.INVALID_STATUS, 'correlationIdentifier'),
    relatedStatusIdentifiers,
    history: [],
    approvalOutcomes: [],
    publicationOutcomes: [],
  };
  const creation = historyEntry(base, null, OperationalStatus.CREATED, input.transitionTimestamp, input.transitionEvidenceReference, input.auditReferences ?? []);
  return freezeSnapshot({ ...base, version: 1, history: [creation] });
}

// OP-002A may associate its outcome with the current snapshot, but cannot invent a
// post-approval status or rewrite the OP-001E transition history.
export function associateApprovalOutcome(snapshot, association) {
  if (snapshot.currentStatus !== OperationalStatus.READY_FOR_APPROVAL) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.INVALID_TRANSITION, 'Approval outcome requires READY_FOR_APPROVAL.');
  }
  if (association?.businessCaseReference !== snapshot.association.businessCaseReference ||
      association?.decisionReference !== snapshot.association.currentDecisionReference ||
      association?.correlationIdentifier !== snapshot.correlationIdentifier) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'Approval outcome must remain associated with the same case, Decision, and correlation identifier.');
  }
  const approvalReference = requireText(association.approvalReference, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'approvalReference');
  if (snapshot.approvalOutcomes.some((entry) => entry.approvalReference === approvalReference)) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'Approval outcome is already associated with this Operational Status.');
  }
  const outcome = Object.freeze({
    approvalReference,
    outcome: requireText(association.outcome, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'outcome'),
    recordedAt: requireText(association.recordedAt, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'recordedAt'),
    auditReference: requireText(association.auditReference, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'auditReference'),
  });
  return freezeSnapshot({ ...snapshot, version: snapshot.version + 1, approvalOutcomes: [...snapshot.approvalOutcomes, outcome] });
}

// OP-002B records publication linkage without adding an unauthorized status or
// changing any prior status transition or approval association.
export function associatePublicationOutcome(snapshot, association) {
  if (snapshot.currentStatus !== OperationalStatus.READY_FOR_APPROVAL || snapshot.approvalOutcomes.length === 0) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.INVALID_TRANSITION, 'Publication outcome requires a valid approval-associated Operational Status.');
  }
  if (association?.businessCaseReference !== snapshot.association.businessCaseReference ||
      association?.decisionReference !== snapshot.association.currentDecisionReference ||
      association?.correlationIdentifier !== snapshot.correlationIdentifier ||
      !snapshot.approvalOutcomes.some((entry) => entry.approvalReference === association.approvalReference && entry.outcome === 'APPROVED')) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'Publication outcome must remain associated with the approved case, Decision, and correlation identifier.');
  }
  const publicationReference = requireText(association.publicationReference, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'publicationReference');
  if (snapshot.publicationOutcomes.some((entry) => entry.publicationReference === publicationReference)) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'Publication outcome is already associated with this Operational Status.');
  }
  const outcome = Object.freeze({
    publicationReference,
    approvalReference: association.approvalReference,
    outcome: requireText(association.outcome, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'outcome'),
    recordedAt: requireText(association.recordedAt, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'recordedAt'),
    auditReference: requireText(association.auditReference, OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'auditReference'),
  });
  return freezeSnapshot({ ...snapshot, version: snapshot.version + 1, publicationOutcomes: [...snapshot.publicationOutcomes, outcome] });
}

export function transitionOperationalStatus(snapshot, nextStatus, transition) {
  if (!isOperationalStatus(nextStatus)) throw new OperationalStatusValidationError(OperationalStatusErrorCode.INVALID_STATUS, `${nextStatus} is not an authorized Operational Status.`);
  if (!isAuthorizedOperationalStatusTransition(snapshot.currentStatus, nextStatus)) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.INVALID_TRANSITION, `Cannot transition from ${snapshot.currentStatus} to ${nextStatus}.`);
  }
  if (transition?.businessCaseReference !== snapshot.association.businessCaseReference ||
      transition?.decisionReference !== snapshot.association.currentDecisionReference ||
      transition?.correlationIdentifier !== snapshot.correlationIdentifier) {
    throw new OperationalStatusValidationError(OperationalStatusErrorCode.ASSOCIATION_MISMATCH, 'Transition evidence must remain associated with the same case, decision, and correlation identifier.');
  }
  const entry = historyEntry(snapshot, snapshot.currentStatus, nextStatus, transition.transitionTimestamp, transition.transitionEvidenceReference, transition.auditReferences ?? []);
  return freezeSnapshot({ ...snapshot, version: snapshot.version + 1, currentStatus: nextStatus, history: [...snapshot.history, entry] });
}
