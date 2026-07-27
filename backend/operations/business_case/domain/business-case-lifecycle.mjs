export const BusinessCaseState = Object.freeze({
  CREATED: 'CREATED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
});

const transitions = Object.freeze({
  [BusinessCaseState.CREATED]: Object.freeze([BusinessCaseState.ACTIVE]),
  [BusinessCaseState.ACTIVE]: Object.freeze([BusinessCaseState.COMPLETED]),
  [BusinessCaseState.COMPLETED]: Object.freeze([BusinessCaseState.CLOSED]),
  [BusinessCaseState.CLOSED]: Object.freeze([]),
});

export function canTransitionBusinessCase(from, to) {
  return transitions[from]?.includes(to) ?? false;
}

