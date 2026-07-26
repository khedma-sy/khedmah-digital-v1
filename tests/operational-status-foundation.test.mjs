import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { establishReadyForApprovalStatus } from '../backend/operations/operational_status/application/operational-status-operations.mjs';
import { createOperationalStatus, transitionOperationalStatus } from '../backend/operations/operational_status/domain/operational-status.mjs';
import { OperationalStatusErrorCode } from '../backend/operations/operational_status/domain/operational-status-errors.mjs';
import { OperationalStatus } from '../backend/operations/operational_status/domain/operational-status-transitions.mjs';

const caseIdentifier = 'case:business:001';
const decisionReference = 'decision:001';
const policyReference = 'policy:business-onboarding:v1';
const correlationIdentifier = 'correlation:001';
const statusInput = {
  statusIdentifier: 'operational-status:001', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference,
  governingPolicyReference: policyReference, responsibleRole: 'BUSINESS_REGISTRATION_OFFICER', correlationIdentifier,
  transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:status-created', auditReferences: ['audit:status-created'],
};
const transition = (name, minute) => ({
  businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier,
  transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`],
});

test('unit: creates a valid immutable Operational Status with append-only history', () => {
  const value = createOperationalStatus(statusInput);
  assert.equal(value.currentStatus, OperationalStatus.CREATED);
  assert.equal(value.version, 1);
  assert.deepEqual(value.history[0].previousStatus, null);
  assert.ok(Object.isFrozen(value.history));
});

test('unit: rejects invalid status, duplicates, missing references and circular references', () => {
  assert.throws(() => createOperationalStatus({ ...statusInput, currentStatus: 'APPROVED' }), { code: OperationalStatusErrorCode.INVALID_STATUS });
  assert.throws(() => createOperationalStatus(statusInput, { existingStatusIdentifiers: [statusInput.statusIdentifier] }), { code: OperationalStatusErrorCode.DUPLICATE_STATUS_ID });
  assert.throws(() => createOperationalStatus({ ...statusInput, businessCaseReference: '' }), { code: OperationalStatusErrorCode.MISSING_BUSINESS_CASE });
  assert.throws(() => createOperationalStatus({ ...statusInput, currentDecisionReference: '' }), { code: OperationalStatusErrorCode.MISSING_DECISION });
  assert.throws(() => createOperationalStatus({ ...statusInput, governingPolicyReference: '' }), { code: OperationalStatusErrorCode.MISSING_POLICY });
  assert.throws(() => createOperationalStatus({ ...statusInput, responsibleRole: '' }), { code: OperationalStatusErrorCode.MISSING_ROLE });
  assert.throws(() => createOperationalStatus({ ...statusInput, relatedStatusIdentifiers: [statusInput.statusIdentifier] }), { code: OperationalStatusErrorCode.CIRCULAR_REFERENCE });
});

test('unit: rejects invalid transitions and changed case or Decision associations', () => {
  const created = createOperationalStatus(statusInput);
  assert.throws(() => transitionOperationalStatus(created, OperationalStatus.DECISION_RECORDED, transition('skip', 1)), { code: OperationalStatusErrorCode.INVALID_TRANSITION });
  assert.throws(() => transitionOperationalStatus(created, OperationalStatus.UNDER_VERIFICATION, { ...transition('wrong', 1), decisionReference: 'decision:changed' }), { code: OperationalStatusErrorCode.ASSOCIATION_MISMATCH });
});

test('integration: Business Case Decision remains an immutable reference in Operational Status audit history', () => {
  const value = establishReadyForApprovalStatus({ statusInput, transitions: [transition('under-verification', 1), transition('decision-recorded', 2), transition('ready-for-approval', 3)] });
  assert.equal(value.currentStatus, OperationalStatus.READY_FOR_APPROVAL);
  assert.equal(value.association.currentDecisionReference, decisionReference);
  assert.ok(value.history.every((entry) => entry.decisionReference === decisionReference && entry.businessCaseReference === caseIdentifier));
  assert.deepEqual(value.history.map(({ currentStatus }) => currentStatus), Object.values(OperationalStatus));
});

test('end-to-end: OP-001A through OP-001E terminates at READY_FOR_APPROVAL with audit evidence and no approval', () => {
  const association = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });
  const businessCase = runBusinessCaseOperationalFlow({
    caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: statusInput.responsibleRole, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' },
    registration: association('registration:001'), verification: association('verification:001'),
    decision: { ...association(decisionReference), verificationReference: 'verification:001' },
    timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' },
  });
  const status = establishReadyForApprovalStatus({ statusInput: { ...statusInput, businessCaseReference: businessCase.caseIdentifier, currentDecisionReference: businessCase.references.decision }, transitions: [transition('under-verification', 1), transition('decision-recorded', 2), transition('ready-for-approval', 3)] });
  assert.equal(status.currentStatus, 'READY_FOR_APPROVAL');
  assert.equal(status.history.at(-1).auditReferences[0], 'audit:ready-for-approval');
  assert.equal('approval' in status, false);
});

