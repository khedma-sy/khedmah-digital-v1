import { associateVisibilityOutcome } from '../../operational_status/domain/operational-status.mjs';
import { establishVisibilityEligibility, recordVisibilityOutcome } from '../domain/business-visibility.mjs';

// Records policy-controlled visibility and audit association, then stops without
// creating public representation, discovery, search, or runtime behavior.
export function executeBusinessVisibility({ eligibility, outcome, outcomeInput, duplicateContext }) {
  const eligible = establishVisibilityEligibility(eligibility, duplicateContext);
  const visibility = recordVisibilityOutcome(eligible, outcome, outcomeInput);
  const audit = visibility.auditRecords.at(-1);
  const operationalStatus = associateVisibilityOutcome(eligibility.operationalStatus, {
    visibilityReference: visibility.visibilityIdentifier,
    publicationReference: visibility.associations.publicationReference,
    outcome: visibility.status,
    recordedAt: audit.recordedAt,
    auditReference: audit.auditReference,
    businessCaseReference: visibility.associations.businessCaseReference,
    decisionReference: visibility.associations.decisionReference,
    correlationIdentifier: visibility.correlationIdentifier,
  });
  return Object.freeze({ visibility, operationalStatus });
}

