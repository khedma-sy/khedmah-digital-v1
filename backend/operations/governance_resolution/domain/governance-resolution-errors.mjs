export class GovernanceResolutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GovernanceResolutionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const GovernanceResolutionErrorCode = Object.freeze({
  MISSING_POLICY: 'MISSING_AUTHORITATIVE_POLICY',
  MISSING_ROLE: 'MISSING_AUTHORITATIVE_ROLE',
  INVALID_POLICY: 'INVALID_AUTHORITATIVE_POLICY',
  INVALID_ROLE: 'INVALID_AUTHORITATIVE_ROLE',
  INVALID_OUTPUT: 'INVALID_GOVERNANCE_RESOLVER_OUTPUT',
  DUPLICATE_BINDING: 'DUPLICATE_GOVERNANCE_BINDING',
  INVALID_LINEAGE: 'INVALID_GOVERNANCE_LINEAGE',
  INVALID_LIFECYCLE: 'INVALID_GOVERNANCE_RESOLUTION_LIFECYCLE',
});

