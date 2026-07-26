import { runBusinessCaseOperationalFlow } from '../../backend/operations/business_case/application/business-case-operations.mjs';
import { executeBusinessApproval } from '../../backend/operations/business_approval/application/business-approval-operations.mjs';
import { ApprovalStatus } from '../../backend/operations/business_approval/domain/business-approval.mjs';
import { executeBusinessPublication } from '../../backend/operations/business_publication/application/business-publication-operations.mjs';
import { PublicationStatus } from '../../backend/operations/business_publication/domain/business-publication.mjs';
import { executeBusinessSearch } from '../../backend/operations/business_search/application/business-search-operations.mjs';
import { BusinessSearchStatus } from '../../backend/operations/business_search/domain/business-search.mjs';
import { executeBusinessVisibility } from '../../backend/operations/business_visibility/application/business-visibility-operations.mjs';
import { VisibilityStatus } from '../../backend/operations/business_visibility/domain/business-visibility.mjs';
import { establishReadyForApprovalStatus } from '../../backend/operations/operational_status/application/operational-status-operations.mjs';
import { establishPublicBusinessProfile } from '../../backend/operations/public_business_profile/application/public-business-profile-operations.mjs';
import { executePublicDiscovery } from '../../backend/operations/public_discovery/application/public-discovery-operations.mjs';
import { DiscoveryStatus } from '../../backend/operations/public_discovery/domain/public-discovery.mjs';

export function executeCompleteOperationalChain({ operationalContext, governanceContext } = {}) {
  const caseIdentifier = 'case:integration:003a';
  const decisionReference = 'decision:integration:003a';
  const policyReference = 'policy:integration:003a';
  const correlationIdentifier = 'correlation:integration:003a';
  const responsibleRole = 'INTEGRATION_GOVERNANCE_OFFICER';
  const association = (reference) => ({ reference, caseIdentifier, correlationId: correlationIdentifier, policyReference });
  const canonical = operationalContext ?? {
    registration: association('registration:integration:003a'),
    verification: association('verification:integration:003a'),
    verificationEvidence: { reference: 'verification:integration:003a', status: 'COMPLETED' },
    decision: { ...association(decisionReference), verificationReference: 'verification:integration:003a' },
  };
  const governance = governanceContext ?? { policyReference, responsibleRole, authorizedRoles: [responsibleRole], approvalPermitted: true, publicationPermitted: true, visibilityPermitted: true, publicExposurePermitted: true, discoveryPermitted: true, searchPermitted: true };
  const businessCase = runBusinessCaseOperationalFlow({
    caseInput: { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: governance.responsibleRole, governingPolicyReference: governance.policyReference, correlationId: correlationIdentifier, createdAt: '2026-07-26T09:00:00Z' },
    registration: canonical.registration,
    verification: canonical.verification,
    decision: canonical.decision,
    timestamps: { activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z', verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z' },
  });
  const transition = (name, minute) => ({ businessCaseReference: caseIdentifier, decisionReference, correlationIdentifier, transitionTimestamp: `2026-07-26T10:0${minute}:00Z`, transitionEvidenceReference: `evidence:${name}`, auditReferences: [`audit:${name}`] });
  const readyStatus = establishReadyForApprovalStatus({
    statusInput: { statusIdentifier: 'status:integration:003a', businessCaseReference: caseIdentifier, currentDecisionReference: decisionReference, governingPolicyReference: governance.policyReference, responsibleRole: governance.responsibleRole, correlationIdentifier, transitionTimestamp: '2026-07-26T10:00:00Z', transitionEvidenceReference: 'evidence:status-created', auditReferences: ['audit:status-created'] },
    transitions: [transition('verification', 1), transition('decision', 2), transition('ready', 3)],
  });
  const approved = executeBusinessApproval({
    eligibility: { approvalIdentifier: 'approval:integration:003a', businessCase, operationalStatus: readyStatus, verification: canonical.verificationEvidence, authorization: { responsibleRole: governance.responsibleRole, authorizedRoles: governance.authorizedRoles, governingPolicyReference: governance.policyReference, approvalPermitted: governance.approvalPermitted }, recordedAt: '2026-07-26T11:00:00Z', eligibilityEvidenceReference: 'evidence:approval-eligible' },
    outcome: ApprovalStatus.APPROVED,
    outcomeInput: { recordedAt: '2026-07-26T11:01:00Z', outcomeEvidenceReference: 'evidence:approved', outcomeReasonReference: 'reason:approved' },
  });
  const published = executeBusinessPublication({
    eligibility: { publicationIdentifier: 'publication:integration:003a', businessCase, approval: approved.approval, operationalStatus: approved.operationalStatus, governance: { responsibleRole: governance.responsibleRole, authorizedRoles: governance.authorizedRoles, governingPolicyReference: governance.policyReference, publicationPermitted: governance.publicationPermitted }, recordedAt: '2026-07-26T12:00:00Z', eligibilityEvidenceReference: 'evidence:publication-eligible' },
    outcome: PublicationStatus.PUBLISHED,
    outcomeInput: { recordedAt: '2026-07-26T12:01:00Z', outcomeEvidenceReference: 'evidence:published', outcomeReasonReference: 'reason:published' },
  });
  const visible = executeBusinessVisibility({
    eligibility: { visibilityIdentifier: 'visibility:integration:003a', businessCase, publication: published.publication, operationalStatus: published.operationalStatus, governance: { responsibleRole: governance.responsibleRole, authorizedRoles: governance.authorizedRoles, governingPolicyReference: governance.policyReference, visibilityPermitted: governance.visibilityPermitted }, recordedAt: '2026-07-26T13:00:00Z', eligibilityEvidenceReference: 'evidence:visibility-eligible' },
    outcome: VisibilityStatus.VISIBLE,
    outcomeInput: { recordedAt: '2026-07-26T13:01:00Z', outcomeEvidenceReference: 'evidence:visible', outcomeReasonReference: 'reason:visible' },
  });
  const profile = establishPublicBusinessProfile({
    profileIdentifier: 'profile:integration:003a', businessCase, publication: published.publication, visibility: visible.visibility,
    governance: { governingPolicyReference: governance.policyReference, publicExposurePermitted: governance.publicExposurePermitted },
    publicInformation: { businessName: 'خدمة التكامل', businessCategoryReference: 'category:integration', businessDescription: 'ملف اختبار التكامل التشغيلي.', publicContactMethods: [{ type: 'EMAIL', value: 'public@example.test' }], businessLocationReference: 'location:damascus', operatingHours: [{ dayReference: 'SUNDAY', opensAt: '09:00', closesAt: '17:00' }], verificationBadgeReference: 'badge:verified:integration', publicMetadata: { language: 'ar' } },
    createdAt: '2026-07-26T14:00:00Z', auditReference: 'audit:profile:integration', evidenceReference: 'evidence:profile',
  });
  const discovered = executePublicDiscovery({
    eligibility: { discoveryIdentifier: 'discovery:integration:003a', publicProfile: profile.profile, visibility: visible.visibility, publication: published.publication, governance: { governingPolicyReference: governance.policyReference, discoveryPermitted: governance.discoveryPermitted }, recordedAt: '2026-07-26T15:00:00Z', eligibilityEvidenceReference: 'evidence:discovery-eligible' },
    outcome: DiscoveryStatus.DISCOVERABLE,
    outcomeInput: { recordedAt: '2026-07-26T15:01:00Z', outcomeEvidenceReference: 'evidence:discoverable', outcomeReasonReference: 'reason:discoverable' },
  });
  const searched = executeBusinessSearch({
    queryInput: { queryIdentifier: 'query:integration:003a', term: 'التكامل', requestedAt: '2026-07-26T16:00:00Z' },
    eligibility: { searchIdentifier: 'search:integration:003a', discovery: discovered.discovery, publicProfile: profile.profile, visibility: visible.visibility, publication: published.publication, governance: { governingPolicyReference: governance.policyReference, searchPermitted: governance.searchPermitted }, recordedAt: '2026-07-26T16:01:00Z', eligibilityEvidenceReference: 'evidence:search-eligible' },
    outcome: BusinessSearchStatus.SEARCHABLE,
    outcomeInput: { recordedAt: '2026-07-26T16:02:00Z', outcomeEvidenceReference: 'evidence:searchable', outcomeReasonReference: 'reason:searchable' },
  });
  return Object.freeze({ policyReference, responsibleRole, correlationIdentifier, businessCase, readyStatus, approved, published, visible, profile, discovered, searched });
}
