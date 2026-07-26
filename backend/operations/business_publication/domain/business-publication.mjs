import { BusinessPublicationError, BusinessPublicationErrorCode } from './business-publication-errors.mjs';

export const PublicationStatus = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
});

const requireText = (value, code, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new BusinessPublicationError(code, `${field} is required.`, { field });
  return value.trim();
};

const freezePublication = (publication) => Object.freeze({
  ...publication,
  associations: Object.freeze({ ...publication.associations }),
  governance: Object.freeze({ ...publication.governance }),
  auditRecords: Object.freeze(publication.auditRecords.map((record) => Object.freeze({ ...record }))),
});

const auditRecord = (publication, action, input) => ({
  auditReference: `audit:${publication.publicationIdentifier}:${publication.version + 1}:${action}`,
  action,
  publicationIdentifier: publication.publicationIdentifier,
  businessCaseReference: publication.associations.businessCaseReference,
  approvalReference: publication.associations.approvalReference,
  operationalStatusReference: publication.associations.operationalStatusReference,
  correlationIdentifier: publication.correlationIdentifier,
  policyReference: publication.governance.governingPolicyReference,
  responsibleRole: publication.governance.responsibleRole,
  evidenceReference: requireText(input.evidenceReference, BusinessPublicationErrorCode.INVALID_REQUEST, 'evidenceReference'),
  recordedAt: requireText(input.recordedAt, BusinessPublicationErrorCode.INVALID_REQUEST, 'recordedAt'),
});

export function establishPublicationEligibility(input, { existingPublicationIdentifiers = [], publishedBusinessCaseReferences = [] } = {}) {
  const approval = input?.approval;
  if (!approval?.approvalIdentifier) throw new BusinessPublicationError(BusinessPublicationErrorCode.MISSING_APPROVAL, 'Business Approval is required.');
  if (approval.status !== 'APPROVED') throw new BusinessPublicationError(BusinessPublicationErrorCode.INVALID_APPROVAL_OUTCOME, 'Business Approval outcome must be APPROVED.');
  const businessCase = input?.businessCase;
  if (!businessCase?.caseIdentifier) throw new BusinessPublicationError(BusinessPublicationErrorCode.MISSING_BUSINESS_CASE, 'Business Case is required.');
  if (approval.associations?.businessCaseReference !== businessCase.caseIdentifier || approval.associations?.decisionReference !== businessCase.references?.decision) {
    throw new BusinessPublicationError(BusinessPublicationErrorCode.INVALID_REQUEST, 'Approval does not belong to the supplied Business Case.');
  }
  const operationalStatus = input?.operationalStatus;
  if (operationalStatus?.currentStatus !== 'READY_FOR_APPROVAL' || operationalStatus.association?.businessCaseReference !== businessCase.caseIdentifier ||
      !operationalStatus.approvalOutcomes?.some((entry) => entry.approvalReference === approval.approvalIdentifier && entry.outcome === 'APPROVED')) {
    throw new BusinessPublicationError(BusinessPublicationErrorCode.INVALID_OPERATIONAL_STATUS, 'A valid Operational Status associated with the approved outcome is required.');
  }
  const publicationIdentifier = requireText(input?.publicationIdentifier, BusinessPublicationErrorCode.INVALID_REQUEST, 'publicationIdentifier');
  if (existingPublicationIdentifiers.includes(publicationIdentifier) || publishedBusinessCaseReferences.includes(businessCase.caseIdentifier)) {
    throw new BusinessPublicationError(BusinessPublicationErrorCode.DUPLICATE_PUBLICATION, 'A publication already exists for this identifier or Business Case.');
  }
  const responsibleRole = requireText(input?.governance?.responsibleRole, BusinessPublicationErrorCode.UNAUTHORIZED_ROLE, 'responsibleRole');
  if (!input.governance.authorizedRoles?.includes(responsibleRole) || responsibleRole !== operationalStatus.association.responsibleRole) {
    throw new BusinessPublicationError(BusinessPublicationErrorCode.UNAUTHORIZED_ROLE, 'Responsible role is not authorized to publish this Business Case.');
  }
  const governingPolicyReference = requireText(input?.governance?.governingPolicyReference, BusinessPublicationErrorCode.POLICY_VIOLATION, 'governingPolicyReference');
  if (!input.governance.publicationPermitted || governingPolicyReference !== businessCase.ownership.governingPolicyReference || governingPolicyReference !== operationalStatus.association.governingPolicyReference) {
    throw new BusinessPublicationError(BusinessPublicationErrorCode.POLICY_VIOLATION, 'Governing policy does not permit publication.');
  }
  const base = {
    publicationIdentifier,
    version: 0,
    status: PublicationStatus.ELIGIBLE,
    publicationTimestamp: null,
    associations: { businessCaseReference: businessCase.caseIdentifier, approvalReference: approval.approvalIdentifier, decisionReference: businessCase.references.decision, operationalStatusReference: operationalStatus.statusIdentifier },
    governance: { responsibleRole, governingPolicyReference },
    correlationIdentifier: businessCase.correlationId,
    auditRecords: [],
  };
  const audit = auditRecord(base, 'BUSINESS_PUBLICATION_ELIGIBLE', { recordedAt: input.recordedAt, evidenceReference: input.eligibilityEvidenceReference });
  return freezePublication({ ...base, version: 1, auditRecords: [audit] });
}

export function recordPublicationOutcome(publication, outcome, input) {
  if (![PublicationStatus.PUBLISHED, PublicationStatus.REJECTED].includes(outcome) || publication.status !== PublicationStatus.ELIGIBLE) {
    throw new BusinessPublicationError(BusinessPublicationErrorCode.INVALID_TRANSITION, `Cannot transition publication from ${publication.status} to ${outcome}.`);
  }
  const audit = auditRecord(publication, `BUSINESS_PUBLICATION_${outcome}`, { recordedAt: input.recordedAt, evidenceReference: input.outcomeEvidenceReference });
  return freezePublication({
    ...publication,
    version: publication.version + 1,
    status: outcome,
    publicationTimestamp: outcome === PublicationStatus.PUBLISHED ? audit.recordedAt : null,
    outcomeReasonReference: requireText(input.outcomeReasonReference, BusinessPublicationErrorCode.INVALID_REQUEST, 'outcomeReasonReference'),
    auditRecords: [...publication.auditRecords, audit],
  });
}

