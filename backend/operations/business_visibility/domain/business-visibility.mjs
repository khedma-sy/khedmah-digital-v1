import { BusinessVisibilityError, BusinessVisibilityErrorCode } from './business-visibility-errors.mjs';

export const VisibilityStatus = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  VISIBLE: 'VISIBLE',
  HIDDEN: 'HIDDEN',
});

const requireText = (value, code, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new BusinessVisibilityError(code, `${field} is required.`, { field });
  return value.trim();
};

const freezeVisibility = (record) => Object.freeze({
  ...record,
  associations: Object.freeze({ ...record.associations }),
  governance: Object.freeze({ ...record.governance }),
  auditRecords: Object.freeze(record.auditRecords.map((audit) => Object.freeze({ ...audit }))),
});

const auditRecord = (record, action, input) => ({
  auditReference: `audit:${record.visibilityIdentifier}:${record.version + 1}:${action}`,
  action,
  visibilityIdentifier: record.visibilityIdentifier,
  businessCaseReference: record.associations.businessCaseReference,
  publicationReference: record.associations.publicationReference,
  operationalStatusReference: record.associations.operationalStatusReference,
  correlationIdentifier: record.correlationIdentifier,
  policyReference: record.governance.governingPolicyReference,
  responsibleRole: record.governance.responsibleRole,
  evidenceReference: requireText(input.evidenceReference, BusinessVisibilityErrorCode.INVALID_REQUEST, 'evidenceReference'),
  recordedAt: requireText(input.recordedAt, BusinessVisibilityErrorCode.INVALID_REQUEST, 'recordedAt'),
});

export function establishVisibilityEligibility(input, { existingVisibilityIdentifiers = [], visibleBusinessCaseReferences = [] } = {}) {
  const publication = input?.publication;
  if (!publication?.publicationIdentifier) throw new BusinessVisibilityError(BusinessVisibilityErrorCode.MISSING_PUBLICATION, 'Business Publication is required.');
  if (publication.status !== 'PUBLISHED' || !publication.publicationTimestamp) throw new BusinessVisibilityError(BusinessVisibilityErrorCode.INVALID_PUBLICATION, 'Business Publication must have a PUBLISHED outcome and timestamp.');
  const businessCase = input?.businessCase;
  if (!businessCase?.caseIdentifier) throw new BusinessVisibilityError(BusinessVisibilityErrorCode.MISSING_BUSINESS_CASE, 'Business Case is required.');
  if (publication.associations?.businessCaseReference !== businessCase.caseIdentifier || publication.associations?.decisionReference !== businessCase.references?.decision) {
    throw new BusinessVisibilityError(BusinessVisibilityErrorCode.INVALID_REQUEST, 'Publication does not belong to the supplied Business Case.');
  }
  const operationalStatus = input?.operationalStatus;
  if (!operationalStatus?.statusIdentifier) throw new BusinessVisibilityError(BusinessVisibilityErrorCode.MISSING_OPERATIONAL_STATUS, 'Operational Status is required.');
  if (operationalStatus.currentStatus !== 'READY_FOR_APPROVAL' || operationalStatus.association?.businessCaseReference !== businessCase.caseIdentifier ||
      !operationalStatus.publicationOutcomes?.some((entry) => entry.publicationReference === publication.publicationIdentifier && entry.outcome === 'PUBLISHED')) {
    throw new BusinessVisibilityError(BusinessVisibilityErrorCode.INVALID_REQUEST, 'Operational Status is not associated with this published Business Case.');
  }
  const visibilityIdentifier = requireText(input?.visibilityIdentifier, BusinessVisibilityErrorCode.INVALID_REQUEST, 'visibilityIdentifier');
  if (existingVisibilityIdentifiers.includes(visibilityIdentifier) || visibleBusinessCaseReferences.includes(businessCase.caseIdentifier)) {
    throw new BusinessVisibilityError(BusinessVisibilityErrorCode.DUPLICATE_VISIBILITY, 'A Visibility record already exists for this identifier or Business Case.');
  }
  const responsibleRole = requireText(input?.governance?.responsibleRole, BusinessVisibilityErrorCode.UNAUTHORIZED_ROLE, 'responsibleRole');
  if (!input.governance.authorizedRoles?.includes(responsibleRole) || responsibleRole !== operationalStatus.association.responsibleRole) {
    throw new BusinessVisibilityError(BusinessVisibilityErrorCode.UNAUTHORIZED_ROLE, 'Responsible role is not authorized to control visibility.');
  }
  const governingPolicyReference = requireText(input?.governance?.governingPolicyReference, BusinessVisibilityErrorCode.POLICY_VIOLATION, 'governingPolicyReference');
  if (!input.governance.visibilityPermitted || governingPolicyReference !== businessCase.ownership.governingPolicyReference || governingPolicyReference !== operationalStatus.association.governingPolicyReference) {
    throw new BusinessVisibilityError(BusinessVisibilityErrorCode.POLICY_VIOLATION, 'Governing policy does not permit visibility.');
  }
  const base = {
    visibilityIdentifier,
    version: 0,
    status: VisibilityStatus.ELIGIBLE,
    associations: { businessCaseReference: businessCase.caseIdentifier, publicationReference: publication.publicationIdentifier, approvalReference: publication.associations.approvalReference, decisionReference: businessCase.references.decision, operationalStatusReference: operationalStatus.statusIdentifier },
    governance: { responsibleRole, governingPolicyReference },
    correlationIdentifier: businessCase.correlationId,
    auditRecords: [],
  };
  const audit = auditRecord(base, 'BUSINESS_VISIBILITY_ELIGIBLE', { recordedAt: input.recordedAt, evidenceReference: input.eligibilityEvidenceReference });
  return freezeVisibility({ ...base, version: 1, auditRecords: [audit] });
}

export function recordVisibilityOutcome(record, outcome, input) {
  if (![VisibilityStatus.VISIBLE, VisibilityStatus.HIDDEN].includes(outcome) || record.status !== VisibilityStatus.ELIGIBLE) {
    throw new BusinessVisibilityError(BusinessVisibilityErrorCode.INVALID_TRANSITION, `Cannot transition visibility from ${record.status} to ${outcome}.`);
  }
  const audit = auditRecord(record, `BUSINESS_VISIBILITY_${outcome}`, { recordedAt: input.recordedAt, evidenceReference: input.outcomeEvidenceReference });
  return freezeVisibility({ ...record, version: record.version + 1, status: outcome, outcomeReasonReference: requireText(input.outcomeReasonReference, BusinessVisibilityErrorCode.INVALID_REQUEST, 'outcomeReasonReference'), auditRecords: [...record.auditRecords, audit] });
}

