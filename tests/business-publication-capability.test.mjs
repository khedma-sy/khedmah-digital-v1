import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { executeBusinessApproval } from '../backend/operations/business_approval/application/business-approval-operations.mjs';
import { ApprovalStatus } from '../backend/operations/business_approval/domain/business-approval.mjs';
import { executeBusinessPublication } from '../backend/operations/business_publication/application/business-publication-operations.mjs';
import { establishPublicationEligibility, PublicationStatus, recordPublicationOutcome } from '../backend/operations/business_publication/domain/business-publication.mjs';
import { BusinessPublicationErrorCode } from '../backend/operations/business_publication/domain/business-publication-errors.mjs';
import { establishReadyForApprovalStatus } from '../backend/operations/operational_status/application/operational-status-operations.mjs';

const caseIdentifier = 'case:business:002';
const decisionReference = 'decision:002';
const policyReference = 'policy:business-publication:v1';
const correlationIdentifier = 'correlation:002';
const role = 'BUSINESS_PUBLISHER';
const ref = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });

function approvedPrerequisites() {
  const businessCase = runBusinessCaseOperationalFlow({ caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: role, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' }, registration: ref('registration:002'), verification: ref('verification:complete:002'), decision: { ...ref(decisionReference), verificationReference: 'verification:complete:002' }, timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' } });
  const statusInput = { statusIdentifier: 'operational-status:002', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: policyReference, responsibleRole: role, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:status-created', auditReferences: ['audit:status-created'] };
  const transition = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  const ready = establishReadyForApprovalStatus({ statusInput, transitions: [transition('verification', 1), transition('decision', 2), transition('ready', 3)] });
  const approved = executeBusinessApproval({ eligibility: { approvalIdentifier: 'approval:002', businessCase, operationalStatus: ready, verification: { reference: 'verification:complete:002', status: 'COMPLETED' }, authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: ApprovalStatus.APPROVED, outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:approved' } });
  return { businessCase, approval: approved.approval, operationalStatus: approved.operationalStatus };
}

const eligibility = (overrides = {}) => ({ publicationIdentifier: 'publication:002', ...approvedPrerequisites(), governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: true }, recordedAt: '2026-07-26T12:00:00Z', eligibilityEvidenceReference: 'evidence:publication-eligible', ...overrides });

test('unit: publishes an eligible approved Business Case with a publication timestamp', () => {
  const eligible = establishPublicationEligibility(eligibility());
  const publication = recordPublicationOutcome(eligible, PublicationStatus.PUBLISHED, { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:governed' });
  assert.equal(publication.status, PublicationStatus.PUBLISHED);
  assert.equal(publication.publicationTimestamp, '2026-07-26T12:01:00Z');
  assert.equal(publication.auditRecords.at(-1).action, 'BUSINESS_PUBLICATION_PUBLISHED');
});

test('unit: records a rejected publication without a publication timestamp', () => {
  const publication = recordPublicationOutcome(establishPublicationEligibility(eligibility()), PublicationStatus.REJECTED, { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:rejected', outcomeReasonReference: 'reason:policy-review' });
  assert.equal(publication.status, PublicationStatus.REJECTED);
  assert.equal(publication.publicationTimestamp, null);
});

test('unit: rejects missing or non-approved approval, duplicates, invalid policy and role', () => {
  assert.throws(() => establishPublicationEligibility(eligibility({ approval: undefined })), { code: BusinessPublicationErrorCode.MISSING_APPROVAL });
  assert.throws(() => establishPublicationEligibility(eligibility({ businessCase: undefined })), { code: BusinessPublicationErrorCode.MISSING_BUSINESS_CASE });
  assert.throws(() => establishPublicationEligibility(eligibility({ approval: { ...approvedPrerequisites().approval, status: 'REJECTED' } })), { code: BusinessPublicationErrorCode.INVALID_APPROVAL_OUTCOME });
  assert.throws(() => establishPublicationEligibility(eligibility(), { existingPublicationIdentifiers: ['publication:002'] }), { code: BusinessPublicationErrorCode.DUPLICATE_PUBLICATION });
  assert.throws(() => establishPublicationEligibility(eligibility({ governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: false } })), { code: BusinessPublicationErrorCode.POLICY_VIOLATION });
  assert.throws(() => establishPublicationEligibility(eligibility({ governance: { responsibleRole: 'UNAUTHORIZED', authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: true } })), { code: BusinessPublicationErrorCode.UNAUTHORIZED_ROLE });
  assert.throws(() => recordPublicationOutcome(establishPublicationEligibility(eligibility()), 'DISCOVERABLE', { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:invalid', outcomeReasonReference: 'reason:invalid' }), { code: BusinessPublicationErrorCode.INVALID_TRANSITION });
});

test('integration and end-to-end: OP-001A through OP-002B ends after Publication and Audit without Discovery', () => {
  const source = eligibility();
  const originalHistory = source.operationalStatus.history;
  const result = executeBusinessPublication({ eligibility: source, outcome: PublicationStatus.PUBLISHED, outcomeInput: { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:approved-for-publication' } });
  assert.equal(result.publication.status, PublicationStatus.PUBLISHED);
  assert.equal(result.operationalStatus.publicationOutcomes[0].publicationReference, result.publication.publicationIdentifier);
  assert.deepEqual(result.operationalStatus.history, originalHistory);
  assert.equal('discovery' in result, false);
  assert.equal('marketplace' in result, false);
});
