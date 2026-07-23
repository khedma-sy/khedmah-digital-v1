export const ErrorCategory = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  OWNERSHIP: 'OWNERSHIP_ERROR',
  DUPLICATE: 'DUPLICATE_ERROR',
  RELATIONSHIP: 'RELATIONSHIP_ERROR',
  LIFECYCLE: 'LIFECYCLE_ERROR',
  TRUST: 'TRUST_ERROR',
  SYSTEM: 'SYSTEM_ERROR',
});

export class KhedmahCoreError extends Error {
  constructor({ code, message, category = ErrorCategory.SYSTEM, metadata = {} }) {
    super(message);
    this.name = 'KhedmahCoreError';
    this.code = code;
    this.category = category;
    this.metadata = Object.freeze({ ...metadata });
  }

  toJSON() {
    return Object.freeze({
      code: this.code,
      message: this.message,
      category: this.category,
      metadata: this.metadata,
    });
  }
}

export function createValidationError(message, metadata = {}) {
  return new KhedmahCoreError({
    code: 'VALIDATION_ERROR',
    message,
    category: ErrorCategory.VALIDATION,
    metadata,
  });
}
