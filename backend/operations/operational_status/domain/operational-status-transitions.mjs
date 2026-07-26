export const OperationalStatus = Object.freeze({
  CREATED: 'CREATED',
  UNDER_VERIFICATION: 'UNDER_VERIFICATION',
  DECISION_RECORDED: 'DECISION_RECORDED',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
});

const authorizedTransitions = Object.freeze({
  [OperationalStatus.CREATED]: Object.freeze([OperationalStatus.UNDER_VERIFICATION]),
  [OperationalStatus.UNDER_VERIFICATION]: Object.freeze([OperationalStatus.DECISION_RECORDED]),
  [OperationalStatus.DECISION_RECORDED]: Object.freeze([OperationalStatus.READY_FOR_APPROVAL]),
  [OperationalStatus.READY_FOR_APPROVAL]: Object.freeze([]),
});

export function isOperationalStatus(value) {
  return Object.values(OperationalStatus).includes(value);
}

export function isAuthorizedOperationalStatusTransition(previousStatus, currentStatus) {
  return authorizedTransitions[previousStatus]?.includes(currentStatus) ?? false;
}

