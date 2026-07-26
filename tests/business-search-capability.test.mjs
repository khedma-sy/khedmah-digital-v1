import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { executeBusinessApproval } from '../backend/operations/business_approval/application/business-approval-operations.mjs';
import { ApprovalStatus } from '../backend/operations/business_approval/domain/business-approval.mjs';
import { executeBusinessPublication } from '../backend/operations/business_publication/application/business-publication-operations.mjs';
import { PublicationStatus } from '../backend/operations/business_publication/domain/business-publication.mjs';
import { executeBusinessSearch } from '../backend/operations/business_search/application/business-search-operations.mjs';
import { BusinessSearchStatus, createBusinessSearchQuery, establishBusinessSearchEligibility, recordBusinessSearchOutcome } from '../backend/operations/business_search/domain/business-search.mjs';
import { BusinessSearchErrorCode } from '../backend/operations/business_search/domain/business-search-errors.mjs';
import { executeBusinessVisibility } from '../backend/operations/business_visibility/application/business-visibility-operations.mjs';
import { VisibilityStatus } from '../backend/operations/business_visibility/domain/business-visibility.mjs';
import { establishReadyForApprovalStatus } from '../backend/operations/operational_status/application/operational-status-operations.mjs';
import { establishPublicBusinessProfile } from '../backend/operations/public_business_profile/application/public-business-profile-operations.mjs';
import { executePublicDiscovery } from '../backend/operations/public_discovery/application/public-discovery-operations.mjs';
import { DiscoveryStatus } from '../backend/operations/public_discovery/domain/public-discovery.mjs';

const caseIdentifier = 'case:business:006', decisionReference = 'decision:006', policyReference = 'policy:search:v1', correlationIdentifier = 'correlation:006', role = 'SEARCH_GOVERNANCE_OFFICER';
const ref = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });

function searchPrerequisites() {
  const businessCase = runBusinessCaseOperationalFlow({ caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: role, governingPolicyReference: policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' }, registration: ref('registration:006'), verification: ref('verification:complete:006'), decision: { ...ref(decisionReference), verificationReference: 'verification:complete:006' }, timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' } });
  const statusInput = { statusIdentifier: 'operational-status:006', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: policyReference, responsibleRole: role, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:created', auditReferences: ['audit:created'] };
  const tr = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  const ready = establishReadyForApprovalStatus({ statusInput, transitions: [tr('verification', 1), tr('decision', 2), tr('ready', 3)] });
  const approved = executeBusinessApproval({ eligibility: { approvalIdentifier: 'approval:006', businessCase, operationalStatus: ready, verification: { reference: 'verification:complete:006', status: 'COMPLETED' }, authorization: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, approvalPermitted: true }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: ApprovalStatus.APPROVED, outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:approved' } });
  const published = executeBusinessPublication({ eligibility: { publicationIdentifier: 'publication:006', businessCase, approval: approved.approval, operationalStatus: approved.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, publicationPermitted: true }, recordedAt: '2026-07-26T12:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: PublicationStatus.PUBLISHED, outcomeInput: { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:published' } });
  const visible = executeBusinessVisibility({ eligibility: { visibilityIdentifier: 'visibility:006', businessCase, publication: published.publication, operationalStatus: published.operationalStatus, governance: { responsibleRole: role, authorizedRoles: [role], governingPolicyReference: policyReference, visibilityPermitted: true }, recordedAt: '2026-07-26T13:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: VisibilityStatus.VISIBLE, outcomeInput: { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:visible', outcomeReasonReference: 'reason:visible' } });
  const profile = establishPublicBusinessProfile({ profileIdentifier: 'public-profile:006', businessCase, publication: published.publication, visibility: visible.visibility, governance: { governingPolicyReference: policyReference, publicExposurePermitted: true }, publicInformation: { businessName: 'حلول الأعمال السورية', businessCategoryReference: 'category:consulting', businessDescription: 'استشارات موثوقة للشركات.', publicContactMethods: [{ type: 'PHONE', value: '+963110000006' }], businessLocationReference: 'location:damascus', operatingHours: [{ dayReference: 'SUNDAY', opensAt: '09:00', closesAt: '17:00' }], verificationBadgeReference: 'badge:verified:006', publicMetadata: { language: 'ar' } }, createdAt: '2026-07-26T14:00:00Z', auditReference: 'audit:profile:006', evidenceReference: 'evidence:profile' });
  const discovered = executePublicDiscovery({ eligibility: { discoveryIdentifier: 'discovery:006', publicProfile: profile.profile, visibility: visible.visibility, publication: published.publication, governance: { governingPolicyReference: policyReference, discoveryPermitted: true }, recordedAt: '2026-07-26T15:00:00Z', eligibilityEvidenceReference: 'evidence:eligible' }, outcome: DiscoveryStatus.DISCOVERABLE, outcomeInput: { recordedAt: '2026-07-26T15:01:00Z', outcomeEvidenceReference: 'evidence:discoverable', outcomeReasonReference: 'reason:discoverable' } });
  return { discovery: discovered.discovery, publicProfile: profile.profile, visibility: visible.visibility, publication: published.publication };
}

const eligibility = (overrides = {}) => ({ searchIdentifier: 'search-record:006', ...searchPrerequisites(), governance: { governingPolicyReference: policyReference, searchPermitted: true }, recordedAt: '2026-07-26T16:00:00Z', eligibilityEvidenceReference: 'evidence:search-eligible', ...overrides });
const outcomeInput = { recordedAt: '2026-07-26T16:01:00Z', outcomeEvidenceReference: 'evidence:searchable', outcomeReasonReference: 'reason:policy-permits' };

test('unit: successful Search returns only the canonical Public Business Profile projection', () => {
  const result = executeBusinessSearch({ queryInput: { queryIdentifier: 'query:006', term: 'استشارات', requestedAt: '2026-07-26T16:02:00Z' }, eligibility: eligibility(), outcome: BusinessSearchStatus.SEARCHABLE, outcomeInput });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].businessName, 'حلول الأعمال السورية');
  assert.equal('auditRecords' in result.results[0], false);
  assert.equal('associations' in result.results[0], false);
});

test('unit: HIDDEN business and unmatched query return no Search result', () => {
  const hidden = executeBusinessSearch({ queryInput: { queryIdentifier: 'query:hidden', term: 'استشارات', requestedAt: '2026-07-26T16:02:00Z' }, eligibility: eligibility(), outcome: BusinessSearchStatus.HIDDEN, outcomeInput });
  const unmatched = executeBusinessSearch({ queryInput: { queryIdentifier: 'query:unmatched', term: 'غير موجود', requestedAt: '2026-07-26T16:02:00Z' }, eligibility: eligibility(), outcome: BusinessSearchStatus.SEARCHABLE, outcomeInput });
  assert.deepEqual(hidden.results, []);
  assert.deepEqual(unmatched.results, []);
});

test('unit: rejects missing Discovery/Profile, invalid Visibility/Publication, policy and duplicates', () => {
  assert.throws(() => establishBusinessSearchEligibility(eligibility({ discovery: undefined })), { code: BusinessSearchErrorCode.MISSING_DISCOVERY });
  assert.throws(() => establishBusinessSearchEligibility(eligibility({ publicProfile: undefined })), { code: BusinessSearchErrorCode.MISSING_PUBLIC_PROFILE });
  assert.throws(() => establishBusinessSearchEligibility(eligibility({ visibility: { ...searchPrerequisites().visibility, status: 'HIDDEN' } })), { code: BusinessSearchErrorCode.INVALID_VISIBILITY });
  assert.throws(() => establishBusinessSearchEligibility(eligibility({ publication: { ...searchPrerequisites().publication, status: 'REJECTED' } })), { code: BusinessSearchErrorCode.INVALID_PUBLICATION });
  assert.throws(() => establishBusinessSearchEligibility(eligibility({ governance: { governingPolicyReference: policyReference, searchPermitted: false } })), { code: BusinessSearchErrorCode.POLICY_VIOLATION });
  assert.throws(() => establishBusinessSearchEligibility(eligibility(), { existingSearchIdentifiers: ['search-record:006'] }), { code: BusinessSearchErrorCode.DUPLICATE_SEARCH });
  assert.throws(() => createBusinessSearchQuery({ queryIdentifier: 'query:invalid', term: '', requestedAt: '2026-07-26T16:02:00Z' }), { code: BusinessSearchErrorCode.INVALID_REQUEST });
  assert.throws(() => recordBusinessSearchOutcome(establishBusinessSearchEligibility(eligibility()), 'RANKED', outcomeInput), { code: BusinessSearchErrorCode.INVALID_TRANSITION });
});

test('integration and end-to-end: OP-001A through OP-002F stops after Search and Audit', () => {
  const result = executeBusinessSearch({ queryInput: { queryIdentifier: 'query:e2e', term: 'حلول', requestedAt: '2026-07-26T16:02:00Z' }, eligibility: eligibility(), outcome: BusinessSearchStatus.SEARCHABLE, outcomeInput });
  assert.equal(result.search.auditRecords.at(-1).action, 'BUSINESS_SEARCH_SEARCHABLE');
  assert.equal(result.results[0].businessName, 'حلول الأعمال السورية');
  assert.equal('ranking' in result, false);
  assert.equal('recommendations' in result, false);
  assert.equal('marketplace' in result, false);
});
