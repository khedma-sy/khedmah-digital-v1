import { BusinessApprovalError, BusinessApprovalErrorCode } from './business-approval-errors.mjs';

export const ApprovalStatus = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const requireText = (value, code, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new BusinessApprovalError(code, `${field} is required.`, { field });
  return value.trim();
};

const freezeApproval = (approval) => Object.freeze({
  ...approval,
  associations: Object.freeze({ ...approval.associations }),
  authorization: Object.freeze({ ...approval.authorization }),
  auditRecords: Object.freeze(approval.auditRecords.map((record) => Object.freeze({ ...record }))),
});

const auditRecord = (approval, action, at, evidenceReference) => ({
  auditReference: `audit:${approval.approvalIdentifier}:${approval.version + 1}:${action}`,
  action,
  approvalIdentifier: approval.approvalIdentifier,
  businessCaseReference: approval.associations.businessCaseReference,
  operationalStatusReference: approval.associations.operationalStatusReference,
  decisionReference: approval.associations.decisionReference,
  correlationIdentifier: approval.correlationIdentifier,
  policyReference: approval.authorization.governingPolicyReference,
  responsibleRole: approval.authorization.responsibleRole,
  evidenceReference: requireText(evidenceReference, BusinessApprovalErrorCode.INVALID_APPROVAL, 'evidenceReference'),
  recordedAt: requireText(at, BusinessApprovalErrorCode.INVALID_APPROVAL, 'recordedAt'),
});

export function establishApprovalEligibility(input, { existingApprovalIdentifiers = [], approvedBusinessCaseReferences = [] } = {}) {
  const businessCase = input?.businessCase;
  if (!businessCase?.caseIdentifier) throw new BusinessApprovalError(BusinessApprovalErrorCode.MISSING_BUSINESS_CASE, 'Business Case is required.');
  if (!businessCase.references?.registration) throw new BusinessApprovalError(BusinessApprovalErrorCode.MISSING_REGISTRATION, 'Registration reference is required.');
  if (!businessCase.references?.verification || input?.verification?.reference !== businessCase.references.verification || input.verification.status !== 'COMPLETED') {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.MISSING_VERIFICATION, 'Matching completed verification evidence is required.');
  }
  if (!businessCase.references?.decision) throw new BusinessApprovalError(BusinessApprovalErrorCode.MISSING_DECISION, 'Decision reference is required.');
  const status = input?.operationalStatus;
  if (status?.currentStatus !== 'READY_FOR_APPROVAL' || status.association?.businessCaseReference !== businessCase.caseIdentifier || status.association?.currentDecisionReference !== businessCase.references.decision) {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.INVALID_OPERATIONAL_STATUS, 'A matching READY_FOR_APPROVAL Operational Status is required.');
  }
  const approvalIdentifier = requireText(input?.approvalIdentifier, BusinessApprovalErrorCode.INVALID_APPROVAL, 'approvalIdentifier');
  if (existingApprovalIdentifiers.includes(approvalIdentifier) || approvedBusinessCaseReferences.includes(businessCase.caseIdentifier)) {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.DUPLICATE_APPROVAL, 'An approval already exists for this identifier or Business Case.');
  }
  const responsibleRole = requireText(input?.authorization?.responsibleRole, BusinessApprovalErrorCode.UNAUTHORIZED_ROLE, 'responsibleRole');
  if (!input.authorization.authorizedRoles?.includes(responsibleRole) || responsibleRole !== status.association.responsibleRole) {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.UNAUTHORIZED_ROLE, 'Responsible role is not authorized for this Business Case.');
  }
  const governingPolicyReference = requireText(input?.authorization?.governingPolicyReference, BusinessApprovalErrorCode.POLICY_VIOLATION, 'governingPolicyReference');
  if (!input.authorization.approvalPermitted || governingPolicyReference !== businessCase.ownership.governingPolicyReference || governingPolicyReference !== status.association.governingPolicyReference) {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.POLICY_VIOLATION, 'Governing policy does not permit this approval.');
  }
  const base = {
    approvalIdentifier,
    version: 0,
    status: ApprovalStatus.ELIGIBLE,
    associations: {
      businessCaseReference: businessCase.caseIdentifier,
      registrationReference: businessCase.references.registration,
      verificationReference: businessCase.references.verification,
      decisionReference: businessCase.references.decision,
      operationalStatusReference: status.statusIdentifier,
    },
    authorization: { responsibleRole, governingPolicyReference },
    correlationIdentifier: businessCase.correlationId,
    auditRecords: [],
  };
  const audit = auditRecord(base, 'BUSINESS_APPROVAL_ELIGIBLE', input.recordedAt, input.eligibilityEvidenceReference);
  return freezeApproval({ ...base, version: 1, auditRecords: [audit] });
}

export function recordApprovalOutcome(approval, outcome, input) {
  if (![ApprovalStatus.APPROVED, ApprovalStatus.REJECTED].includes(outcome)) {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.INVALID_TRANSITION, `Cannot transition approval from ${approval.status} to ${outcome}.`);
  }
  if (approval.status !== ApprovalStatus.ELIGIBLE) {
    throw new BusinessApprovalError(BusinessApprovalErrorCode.INVALID_TRANSITION, 'Only an ELIGIBLE approval can record an outcome.');
  }
  const audit = auditRecord(approval, `BUSINESS_APPROVAL_${outcome}`, input.recordedAt, input.outcomeEvidenceReference);
  return freezeApproval({ ...approval, version: approval.version + 1, status: outcome, outcomeReasonReference: requireText(input.outcomeReasonReference, BusinessApprovalErrorCode.INVALID_APPROVAL, 'outcomeReasonReference'), auditRecords: [...approval.auditRecords, audit] });
}
