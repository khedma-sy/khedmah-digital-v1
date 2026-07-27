import { createOperationalStatus, transitionOperationalStatus } from '../domain/operational-status.mjs';
import { OperationalStatus } from '../domain/operational-status-transitions.mjs';

// Establishes the current case snapshot from canonical references and stops at the
// pre-approval boundary. It performs neither approval nor runtime orchestration.
export function establishReadyForApprovalStatus({ statusInput, transitions, existingStatusIdentifiers = [] }) {
  let snapshot = createOperationalStatus(statusInput, { existingStatusIdentifiers });
  for (const [index, status] of [OperationalStatus.UNDER_VERIFICATION, OperationalStatus.DECISION_RECORDED, OperationalStatus.READY_FOR_APPROVAL].entries()) {
    snapshot = transitionOperationalStatus(snapshot, status, transitions[index]);
  }
  return snapshot;
}

