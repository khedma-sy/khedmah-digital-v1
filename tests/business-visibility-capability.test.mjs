import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { executeBusinessApproval } from '../backend/operations/business_approval/application/business-approval-operations.mjs';
import { ApprovalStatus } from '../backend/operations/business_approval/domain/business-approval.mjs';
import { executeBusinessPublication } from '../backend/operations/business_publication/application/business-publication-operations.mjs';
import { PublicationStatus } from '../backend/operations/business_publication/domain/business-publication.mjs';
import { executeBusinessVisibility } from '../backend/operations/business_visibility/application/business-visibility-operations.mjs';
import { establishVisibilityEligibility, recordVisibilityOutcome, VisibilityStatus } from '../backend/operations/business_visibility/domain/business-visibility.mjs';
import { BusinessVisibilityErrorCode } from '../backend/operations/business_visibility/domain/business-visibility-errors.mjs';
import { establishReadyForApprovalStatus } from '../backend/operations/operational_status/application/operational-status-operations.mjs';

const caseIdentifier = 'case:business:003', decisionReference = 'decision:003', policyReference = 'policy:business-visibility:v1', correlationIdentifier = 'correlation:003', role = 'BUSINESS_VISIBILITY_OFFICER';
const ref = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });

function publishedPrerequisites() {
  const businessCase = runBusinessCaseOperationalFlow({ caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: role, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' }, registration: ref('registration:003'), verification: ref('verification:complete:003'), decision: { ...ref(decisionReference), verificationReference: 'verification:complete:003' }, timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' } });
  const statusInput = { statusIdentifier: 'operational-status:003', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: policyReference, responsibleRole: role, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:created', auditReferences: ['audit:created'] };
  const tr = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  const ready = establishReadyForApprovalStatus({ statusInput, transitions: [tr('verification', 1), tr('decision', 2), tr('ready', 3)] });
  const approved = executeBusinessApproval({ eligibility: { approvalIdentifier: 'approval:003', businessCase, operationalStatus: ready, verification: { reference: 'verification:complete:003', status: 'COMPLETED' }, authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: ApprovalStatus.APPROVED, outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:approved' } });
  const published = executeBusinessPublication({ eligibility: { publicationIdentifier: 'publication:003', businessCase, approval: approved.approval, operationalStatus: approved.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: true }, recordedAt: '2026-07-26T12:00:00Z', eligibilityEvidenceReference: 'evidence:publication-eligible' }, outcome: PublicationStatus.PUBLISHED, outcomeInput: { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:published' } });
  return { businessCase, publication: published.publication, operationalStatus: published.operationalStatus };
}

const eligibility = (overrides = {}) => ({ visibilityIdentifier: 'visibility:003', ...publishedPrerequisites(), governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, visibilityPermitted: true }, recordedAt: '2026-07-26T13:00:00Z', eligibilityEvidenceReference: 'evidence:visibility-eligible', ...overrides });

test('unit: records successful VISIBLE and governed HIDDEN outcomes', () => {
  const input = { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:visibility', outcomeReasonReference: 'reason:policy' };
  assert.equal(recordVisibilityOutcome(establishVisibilityEligibility(eligibility()), VisibilityStatus.VISIBLE, input).status, VisibilityStatus.VISIBLE);
  assert.equal(recordVisibilityOutcome(establishVisibilityEligibility(eligibility()), VisibilityStatus.HIDDEN, input).status, VisibilityStatus.HIDDEN);
});

test('unit: rejects missing or invalid publication and missing Operational Status', () => {
  assert.throws(() => establishVisibilityEligibility(eligibility({ publication: undefined })), { code: BusinessVisibilityErrorCode.MISSING_PUBLICATION });
  assert.throws(() => establishVisibilityEligibility(eligibility({ publication: { ...publishedPrerequisites().publication, status: 'REJECTED' } })), { code: BusinessVisibilityErrorCode.INVALID_PUBLICATION });
  assert.throws(() => establishVisibilityEligibility(eligibility({ operationalStatus: undefined })), { code: BusinessVisibilityErrorCode.MISSING_OPERATIONAL_STATUS });
});

test('unit: rejects duplicates, unauthorized role, policy violation and invalid transition', () => {
  assert.throws(() => establishVisibilityEligibility(eligibility(), { existingVisibilityIdentifiers: ['visibility:003'] }), { code: BusinessVisibilityErrorCode.DUPLICATE_VISIBILITY });
  assert.throws(() => establishVisibilityEligibility(eligibility({ governance: { responsibleRole: 'UNAUTHORIZED', authorizedRoles: [role], governingPolicyReference: policyReference, visibilityPermitted: true } })), { code: BusinessVisibilityErrorCode.UNAUTHORIZED_ROLE });
  assert.throws(() => establishVisibilityEligibility(eligibility({ governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, visibilityPermitted: false } })), { code: BusinessVisibilityErrorCode.POLICY_VIOLATION });
  assert.throws(() => recordVisibilityOutcome(establishVisibilityEligibility(eligibility()), 'DISCOVERABLE', { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:invalid', outcomeReasonReference: 'reason:invalid' }), { code: BusinessVisibilityErrorCode.INVALID_TRANSITION });
});

test('integration and end-to-end: OP-001A through OP-002C stops after Visibility and Audit', () => {
  const source = eligibility();
  const result = executeBusinessVisibility({ eligibility: source, outcome: VisibilityStatus.VISIBLE, outcomeInput: { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:visible', outcomeReasonReference: 'reason:policy-permits' } });
  assert.equal(result.visibility.status, VisibilityStatus.VISIBLE);
  assert.equal(result.visibility.auditRecords.at(-1).action, 'BUSINESS_VISIBILITY_VISIBLE');
  assert.equal(result.operationalStatus.visibilityOutcomes[0].visibilityReference, result.visibility.visibilityIdentifier);
  assert.equal('publicProfile' in result, false);
  assert.equal('discovery' in result, false);
  assert.equal('search' in result, false);
});

