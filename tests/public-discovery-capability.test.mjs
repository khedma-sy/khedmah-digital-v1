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
import { executePublicDiscovery } from '../backend/operations/public_discovery/application/public-discovery-operations.mjs';
import { DiscoveryStatus, establishDiscoveryEligibility, projectDiscoveryListing, recordDiscoveryOutcome } from '../backend/operations/public_discovery/domain/public-discovery.mjs';
import { PublicDiscoveryErrorCode } from '../backend/operations/public_discovery/domain/public-discovery-errors.mjs';

const caseIdentifier = 'case:business:005', decisionReference = 'decision:005', policyReference = 'policy:discovery:v1', correlationIdentifier = 'correlation:005', role = 'DISCOVERY_GOVERNANCE_OFFICER';
const ref = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });

function discoverablePrerequisites() {
  const businessCase = runBusinessCaseOperationalFlow({ caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: role, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' }, registration: ref('registration:005'), verification: ref('verification:complete:005'), decision: { ...ref(decisionReference), verificationReference: 'verification:complete:005' }, timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' } });
  const statusInput = { statusIdentifier: 'operational-status:005', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: policyReference, responsibleRole: role, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:created', auditReferences: ['audit:created'] };
  const tr = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  const ready = establishReadyForApprovalStatus({ statusInput, transitions: [tr('verification', 1), tr('decision', 2), tr('ready', 3)] });
  const approved = executeBusinessApproval({ eligibility: { approvalIdentifier: 'approval:005', businessCase, operationalStatus: ready, verification: { reference: 'verification:complete:005', status: 'COMPLETED' }, authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: ApprovalStatus.APPROVED, outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:approved' } });
  const published = executeBusinessPublication({ eligibility: { publicationIdentifier: 'publication:005', businessCase, approval: approved.approval, operationalStatus: approved.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: true }, recordedAt: '2026-07-26T12:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: PublicationStatus.PUBLISHED, outcomeInput: { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:published' } });
  const visible = executeBusinessVisibility({ eligibility: { visibilityIdentifier: 'visibility:005', businessCase, publication: published.publication, operationalStatus: published.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, visibilityPermitted: true }, recordedAt: '2026-07-26T13:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: VisibilityStatus.VISIBLE, outcomeInput: { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:visible', outcomeReasonReference: 'reason:visible' } });
  const profile = establishPublicBusinessProfile({ profileIdentifier: 'public-profile:005', businessCase, publication: published.publication, visibility: visible.visibility, governance: { governingPolicyReference: policyReference, publicExposurePermitted: true }, publicInformation: { businessName: 'أعمال دمشق', businessCategoryReference: 'category:services', businessDescription: 'خدمات أعمال موثوقة.', publicContactMethods: [{ type: 'PHONE', value: '+963110000005' }], businessLocationReference: 'location:damascus', operatingHours: [{ dayReference: 'SUNDAY', opensAt: '09:00', closesAt: '17:00' }], verificationBadgeReference: 'badge:verified:005', publicMetadata: { language: 'ar' } }, createdAt: '2026-07-26T14:00:00Z', auditReference: 'audit:profile:005', evidenceReference: 'evidence:profile' });
  return { publicProfile: profile.profile, visibility: visible.visibility, publication: published.publication };
}

const eligibility = (overrides = {}) => ({ discoveryIdentifier: 'discovery:005', ...discoverablePrerequisites(), governance: { governingPolicyReference: policyReference, discoveryPermitted: true }, recordedAt: '2026-07-26T15:00:00Z', eligibilityEvidenceReference: 'evidence:discovery-eligible', ...overrides });

test('unit: records DISCOVERABLE and HIDDEN outcomes with controlled projection', () => {
  const input = { recordedAt: '2026-07-26T15:01:00Z', outcomeEvidenceReference: 'evidence:outcome', outcomeReasonReference: 'reason:policy' };
  const discoverable = recordDiscoveryOutcome(establishDiscoveryEligibility(eligibility()), DiscoveryStatus.DISCOVERABLE, input);
  assert.equal(projectDiscoveryListing(discoverable).businessName, 'أعمال دمشق');
  assert.equal(projectDiscoveryListing(recordDiscoveryOutcome(establishDiscoveryEligibility(eligibility()), DiscoveryStatus.HIDDEN, input)), null);
  assert.equal('auditAssociation' in projectDiscoveryListing(discoverable), false);
});

test('unit: rejects missing profile, missing/invalid visibility, and invalid publication', () => {
  assert.throws(() => establishDiscoveryEligibility(eligibility({ publicProfile: undefined })), { code: PublicDiscoveryErrorCode.MISSING_PUBLIC_PROFILE });
  assert.throws(() => establishDiscoveryEligibility(eligibility({ visibility: undefined })), { code: PublicDiscoveryErrorCode.MISSING_VISIBILITY });
  assert.throws(() => establishDiscoveryEligibility(eligibility({ visibility: { ...discoverablePrerequisites().visibility, status: 'HIDDEN' } })), { code: PublicDiscoveryErrorCode.INVALID_VISIBILITY });
  assert.throws(() => establishDiscoveryEligibility(eligibility({ publication: { ...discoverablePrerequisites().publication, status: 'REJECTED' } })), { code: PublicDiscoveryErrorCode.INVALID_PUBLICATION });
});

test('unit: rejects duplicates, unauthorized exposure, policy violation, and invalid transition', () => {
  assert.throws(() => establishDiscoveryEligibility(eligibility(), { existingDiscoveryIdentifiers: ['discovery:005'] }), { code: PublicDiscoveryErrorCode.DUPLICATE_DISCOVERY });
  const prerequisites = discoverablePrerequisites();
  assert.throws(() => establishDiscoveryEligibility(eligibility({ publicProfile: { ...prerequisites.publicProfile, associations: { ...prerequisites.publicProfile.associations, visibilityReference: 'visibility:other' } } })), { code: PublicDiscoveryErrorCode.UNAUTHORIZED_EXPOSURE });
  assert.throws(() => establishDiscoveryEligibility(eligibility({ governance: { governingPolicyReference: policyReference, discoveryPermitted: false } })), { code: PublicDiscoveryErrorCode.POLICY_VIOLATION });
  assert.throws(() => recordDiscoveryOutcome(establishDiscoveryEligibility(eligibility()), 'SEARCHABLE', { recordedAt: '2026-07-26T15:01:00Z', outcomeEvidenceReference: 'evidence:invalid', outcomeReasonReference: 'reason:invalid' }), { code: PublicDiscoveryErrorCode.INVALID_TRANSITION });
});

test('integration and end-to-end: OP-001A through OP-002E stops after Discovery and Audit', () => {
  const result = executePublicDiscovery({ eligibility: eligibility(), outcome: DiscoveryStatus.DISCOVERABLE, outcomeInput: { recordedAt: '2026-07-26T15:01:00Z', outcomeEvidenceReference: 'evidence:discoverable', outcomeReasonReference: 'reason:policy-permits' } });
  assert.equal(result.discovery.auditRecords.at(-1).action, 'PUBLIC_DISCOVERY_DISCOVERABLE');
  assert.equal(result.listing.businessName, 'أعمال دمشق');
  assert.equal('search' in result, false);
  assert.equal('ranking' in result, false);
  assert.equal('filters' in result, false);
});

