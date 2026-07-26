import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { executeBusinessApproval } from '../backend/operations/business_approval/application/business-approval-operations.mjs';
import { ApprovalStatus, establishApprovalEligibility, recordApprovalOutcome } from '../backend/operations/business_approval/domain/business-approval.mjs';
import { BusinessApprovalErrorCode } from '../backend/operations/business_approval/domain/business-approval-errors.mjs';
import { establishReadyForApprovalStatus } from '../backend/operations/operational_status/application/operational-status-operations.mjs';

const caseIdentifier = 'case:business:001';
const decisionReference = 'decision:001';
const policyReference = 'policy:business-onboarding:v1';
const correlationIdentifier = 'correlation:001';
const role = 'BUSINESS_APPROVER';
const reference = (value) => ({ reference: value, caseIdentifier, correlationId: correlationIdentifier, policyReference });

function prerequisites() {
  const businessCase = runBusinessCaseOperationalFlow({
    caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: role, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' },
    registration: reference('registration:001'), verification: reference('verification:complete:001'),
    decision: { ...reference(decisionReference), verificationReference: 'verification:complete:001' },
    timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' },
  });
  const statusInput = { statusIdentifier: 'operational-status:001', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: policyReference, responsibleRole: role, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:status-created', auditReferences: ['audit:status-created'] };
  const transition = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  return { businessCase, operationalStatus: establishReadyForApprovalStatus({ statusInput, transitions: [transition('verification', 1), transition('decision', 2), transition('ready', 3)] }) };
}

const eligibility = (overrides = {}) => ({ approvalIdentifier: 'approval:001', ...prerequisites(), verification: { reference: 'verification:complete:001', status: 'COMPLETED' }, authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:eligible', ...overrides });

test('unit: establishes an eligible approval from all canonical prerequisites', () => {
  const approval = establishApprovalEligibility(eligibility());
  assert.equal(approval.status, ApprovalStatus.ELIGIBLE);
  assert.equal(approval.associations.decisionReference, decisionReference);
  assert.equal(approval.auditRecords[0].action, 'BUSINESS_APPROVAL_ELIGIBLE');
});

test('unit: records approved and rejected terminal outcomes only', () => {
  const eligible = establishApprovalEligibility(eligibility());
  const input = { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:outcome', outcomeReasonReference: 'reason:governed' };
  assert.equal(recordApprovalOutcome(eligible, ApprovalStatus.APPROVED, input).status, ApprovalStatus.APPROVED);
  assert.equal(recordApprovalOutcome(eligible, ApprovalStatus.REJECTED, input).status, ApprovalStatus.REJECTED);
  assert.throws(() => recordApprovalOutcome(eligible, 'PUBLISHED', input), { code: BusinessApprovalErrorCode.INVALID_TRANSITION });
});

test('unit: rejects missing prerequisites, unauthorized roles and policy violations', () => {
  assert.throws(() => establishApprovalEligibility(eligibility({ businessCase: undefined })), { code: BusinessApprovalErrorCode.MISSING_BUSINESS_CASE });
  assert.throws(() => establishApprovalEligibility(eligibility({ verification: { reference: 'verification:complete:001', status: 'PENDING' } })), { code: BusinessApprovalErrorCode.MISSING_VERIFICATION });
  const valid = eligibility();
  const missingDecision = { ...valid, businessCase: { ...valid.businessCase, references: { ...valid.businessCase.references, decision: undefined } } };
  assert.throws(() => establishApprovalEligibility(missingDecision), { code: BusinessApprovalErrorCode.MISSING_DECISION });
  assert.throws(() => establishApprovalEligibility(eligibility({ authorization: { responsibleRole: 'UNAUTHORIZED', authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true } })), { code: BusinessApprovalErrorCode.UNAUTHORIZED_ROLE });
  assert.throws(() => establishApprovalEligibility(eligibility({ authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: false } })), { code: BusinessApprovalErrorCode.POLICY_VIOLATION });
});

test('unit: rejects duplicate approval identifiers and duplicate Business Case approvals', () => {
  assert.throws(() => establishApprovalEligibility(eligibility(), { existingApprovalIdentifiers: ['approval:001'] }), { code: BusinessApprovalErrorCode.DUPLICATE_APPROVAL });
  assert.throws(() => establishApprovalEligibility(eligibility(), { approvedBusinessCaseReferences: [caseIdentifier] }), { code: BusinessApprovalErrorCode.DUPLICATE_APPROVAL });
});

test('integration and end-to-end: OP-001A through OP-002A ends after Approval, audit, and status association', () => {
  const source = eligibility();
  const originalHistory = source.operationalStatus.history;
  const result = executeBusinessApproval({ eligibility: source, outcome: ApprovalStatus.APPROVED, outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:requirements-satisfied' } });
  assert.equal(result.approval.status, ApprovalStatus.APPROVED);
  assert.equal(result.approval.auditRecords.at(-1).action, 'BUSINESS_APPROVAL_APPROVED');
  assert.equal(result.operationalStatus.currentStatus, 'READY_FOR_APPROVAL');
  assert.equal(result.operationalStatus.approvalOutcomes[0].approvalReference, result.approval.approvalIdentifier);
  assert.deepEqual(result.operationalStatus.history, originalHistory);
  assert.equal(result.operationalStatus.history.length, originalHistory.length);
  assert.equal('publication' in result, false);
});
