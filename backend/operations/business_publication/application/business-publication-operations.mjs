import { associatePublicationOutcome } from '../../operational_status/domain/operational-status.mjs';
import { establishPublicationEligibility, recordPublicationOutcome } from '../domain/business-publication.mjs';

// Executes publication recording and its audit association, then stops. Public
// discovery, search, ranking, and runtime orchestration are outside this boundary.
export function executeBusinessPublication({ eligibility, outcome, outcomeInput, duplicateContext }) {
  const eligiblePublication = establishPublicationEligibility(eligibility, duplicateContext);
  const publication = recordPublicationOutcome(eligiblePublication, outcome, outcomeInput);
  const outcomeAudit = publication.auditRecords.at(-1);
  const operationalStatus = associatePublicationOutcome(eligibility.operationalStatus, {
    publicationReference: publication.publicationIdentifier,
    approvalReference: publication.associations.approvalReference,
    outcome: publication.status,
    recordedAt: outcomeAudit.recordedAt,
    auditReference: outcomeAudit.auditReference,
    businessCaseReference: publication.associations.businessCaseReference,
    decisionReference: publication.associations.decisionReference,
    correlationIdentifier: publication.correlationIdentifier,
  });
  return Object.freeze({ publication, operationalStatus });
}

