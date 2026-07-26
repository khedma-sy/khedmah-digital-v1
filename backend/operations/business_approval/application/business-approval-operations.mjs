import { associateApprovalOutcome } from '../../operational_status/domain/operational-status.mjs';
import { establishApprovalEligibility, recordApprovalOutcome } from '../domain/business-approval.mjs';

// Executes the single authorized capability and stops after recording its audit and
// associating the outcome with OP-001E. It performs no publication or orchestration.
export function executeBusinessApproval({ eligibility, outcome, outcomeInput, duplicateContext }) {
  const eligibleApproval = establishApprovalEligibility(eligibility, duplicateContext);
  const approval = recordApprovalOutcome(eligibleApproval, outcome, outcomeInput);
  const outcomeAudit = approval.auditRecords.at(-1);
  const operationalStatus = associateApprovalOutcome(eligibility.operationalStatus, {
    approvalReference: approval.approvalIdentifier,
    outcome: approval.status,
    recordedAt: outcomeAudit.recordedAt,
    auditReference: outcomeAudit.auditReference,
    businessCaseReference: approval.associations.businessCaseReference,
    decisionReference: approval.associations.decisionReference,
    correlationIdentifier: approval.correlationIdentifier,
  });
  return Object.freeze({ approval, operationalStatus });
}

