export class OperationalStatusValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OperationalStatusValidationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const OperationalStatusErrorCode = Object.freeze({
  INVALID_STATUS: 'INVALID_OPERATIONAL_STATUS',
  INVALID_TRANSITION: 'INVALID_OPERATIONAL_STATUS_TRANSITION',
  DUPLICATE_STATUS_ID: 'DUPLICATE_STATUS_IDENTIFIER',
  MISSING_BUSINESS_CASE: 'MISSING_BUSINESS_CASE_REFERENCE',
  MISSING_DECISION: 'MISSING_DECISION_REFERENCE',
  MISSING_POLICY: 'MISSING_POLICY_REFERENCE',
  MISSING_ROLE: 'MISSING_RESPONSIBLE_ROLE',
  CIRCULAR_REFERENCE: 'CIRCULAR_OPERATIONAL_STATUS_REFERENCE',
  ASSOCIATION_MISMATCH: 'OPERATIONAL_STATUS_ASSOCIATION_MISMATCH',
});

