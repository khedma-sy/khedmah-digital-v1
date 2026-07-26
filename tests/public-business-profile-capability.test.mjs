import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { executeBusinessApproval } from '../backend/operations/business_approval/application/business-approval-operations.mjs';
import { ApprovalStatus } from '../backend/operations/business_approval/domain/business-approval.mjs';
import { executeBusinessPublication } from '../backend/operations/business_publication/application/business-publication-operations.mjs';
import { PublicationStatus } from '../backend/operations/business_publication/domain/business-publication.mjs';
import { executeBusinessVisibility } from '../backend/operations/business_visibility/application/business-visibility-operations.mjs';
import { VisibilityStatus } from '../backend/operations/business_visibility/domain/business-visibility.mjs';
import { establishReadyForApprovalStatus } from '../backend/operations/operational_status/application/operational-status-operations.mjs';
import { establishPublicBusinessProfile } from '../backend/operations/public_business_profile/application/public-business-profile-operations.mjs';
import { createPublicBusinessProfile, projectPublicBusinessProfile } from '../backend/operations/public_business_profile/domain/public-business-profile.mjs';
import { PublicBusinessProfileErrorCode } from '../backend/operations/public_business_profile/domain/public-business-profile-errors.mjs';

const caseIdentifier = 'case:business:004', decisionReference = 'decision:004', policyReference = 'policy:public-profile:v1', correlationIdentifier = 'correlation:004', role = 'PUBLIC_PROFILE_OFFICER';
const ref = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });

function visiblePrerequisites() {
  const businessCase = runBusinessCaseOperationalFlow({ caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: role, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' }, registration: ref('registration:004'), verification: ref('verification:complete:004'), decision: { ...ref(decisionReference), verificationReference: 'verification:complete:004' }, timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' } });
  const baseStatus = { statusIdentifier: 'operational-status:004', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: policyReference, responsibleRole: role, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:created', auditReferences: ['audit:created'] };
  const tr = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  const ready = establishReadyForApprovalStatus({ statusInput: baseStatus, transitions: [tr('verification', 1), tr('decision', 2), tr('ready', 3)] });
  const approval = executeBusinessApproval({ eligibility: { approvalIdentifier: 'approval:004', businessCase, operationalStatus: ready, verification: { reference: 'verification:complete:004', status: 'COMPLETED' }, authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: ApprovalStatus.APPROVED, outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:approved' } });
  const publication = executeBusinessPublication({ eligibility: { publicationIdentifier: 'publication:004', businessCase, approval: approval.approval, operationalStatus: approval.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: true }, recordedAt: '2026-07-26T12:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: PublicationStatus.PUBLISHED, outcomeInput: { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:published' } });
  const visibility = executeBusinessVisibility({ eligibility: { visibilityIdentifier: 'visibility:004', businessCase, publication: publication.publication, operationalStatus: publication.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, visibilityPermitted: true }, recordedAt: '2026-07-26T13:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: VisibilityStatus.VISIBLE, outcomeInput: { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:visible', outcomeReasonReference: 'reason:visible' } });
  return { businessCase, publication: publication.publication, visibility: visibility.visibility };
}

const publicInformation = { businessName: 'خدمة الأعمال', businessCategoryReference: 'category:consulting', businessDescription: 'خدمات استشارية للأعمال.', publicContactMethods: [{ type: 'PHONE', value: '+963110000000' }], businessLocationReference: 'location:damascus', operatingHours: [{ dayReference: 'SUNDAY', opensAt: '09:00', closesAt: '17:00' }], verificationBadgeReference: 'badge:verified:004', publicMetadata: { language: 'ar', lastPublicReviewAt: '2026-07-26' } };
const input = (overrides = {}) => ({ profileIdentifier: 'public-profile:004', ...visiblePrerequisites(), governance: { governingPolicyReference: policyReference, publicExposurePermitted: true }, publicInformation, createdAt: '2026-07-26T14:00:00Z', auditReference: 'audit:public-profile:004', evidenceReference: 'evidence:public-profile', ...overrides });

test('unit: creates a valid profile and exposes only the approved public information allowlist', () => {
  const profile = createPublicBusinessProfile(input());
  const projection = projectPublicBusinessProfile(profile);
  assert.equal(projection.businessName, 'خدمة الأعمال');
  assert.deepEqual(Object.keys(projection).sort(), ['businessCategoryReference', 'businessDescription', 'businessLocationReference', 'businessName', 'operatingHours', 'profileIdentifier', 'publicContactMethods', 'publicMetadata', 'verificationBadgeReference', 'version'].sort());
  assert.equal('auditAssociation' in projection, false);
  assert.equal('associations' in projection, false);
});

test('unit: rejects invalid visibility, missing publication, missing Business Case and duplicates', () => {
  assert.throws(() => createPublicBusinessProfile(input({ visibility: { ...visiblePrerequisites().visibility, status: 'HIDDEN' } })), { code: PublicBusinessProfileErrorCode.INVALID_VISIBILITY });
  assert.throws(() => createPublicBusinessProfile(input({ publication: undefined })), { code: PublicBusinessProfileErrorCode.MISSING_PUBLICATION });
  assert.throws(() => createPublicBusinessProfile(input({ businessCase: undefined })), { code: PublicBusinessProfileErrorCode.MISSING_BUSINESS_CASE });
  assert.throws(() => createPublicBusinessProfile(input(), { existingProfileIdentifiers: ['public-profile:004'] }), { code: PublicBusinessProfileErrorCode.DUPLICATE_PROFILE });
});

test('unit: rejects internal fields and policy violations in public exposure', () => {
  assert.throws(() => createPublicBusinessProfile(input({ publicInformation: { ...publicInformation, decisionHistory: ['never-public'] } })), { code: PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE });
  assert.throws(() => createPublicBusinessProfile(input({ publicInformation: { ...publicInformation, publicMetadata: { decision: 'never-public' } } })), { code: PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE });
  assert.throws(() => createPublicBusinessProfile(input({ publicInformation: { ...publicInformation, publicMetadata: { auditRecords: ['never-public'] } } })), { code: PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE });
  assert.throws(() => createPublicBusinessProfile(input({ governance: { governingPolicyReference: policyReference, publicExposurePermitted: false } })), { code: PublicBusinessProfileErrorCode.POLICY_VIOLATION });
});

test('integration and end-to-end: OP-001A through OP-002D stops at Public Business Profile and Audit', () => {
  const result = establishPublicBusinessProfile(input());
  assert.equal(result.profile.auditAssociation.action, 'PUBLIC_BUSINESS_PROFILE_CREATED');
  assert.equal(result.publicRepresentation.businessName, 'خدمة الأعمال');
  assert.equal('discovery' in result, false);
  assert.equal('search' in result, false);
  assert.equal('ranking' in result, false);
});
