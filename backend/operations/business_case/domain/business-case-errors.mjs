export class BusinessCaseValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BusinessCaseValidationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const BusinessCaseErrorCode = Object.freeze({
  DUPLICATE_CASE_ID: 'DUPLICATE_CASE_ID',
  INVALID_TRANSITION: 'INVALID_LIFECYCLE_TRANSITION',
  MISSING_REFERENCE: 'MISSING_REFERENCE',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  INVALID_OWNERSHIP: 'INVALID_OWNERSHIP',
  INVALID_DECISION: 'INVALID_DECISION_ASSOCIATION',
  INVALID_CASE: 'INVALID_BUSINESS_CASE',
});

