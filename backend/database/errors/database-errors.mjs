import { ErrorCategory, KhedmahCoreError } from '../../core/errors/base-error.mjs';

export const DatabaseErrorCode = Object.freeze({
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_MIGRATION_ERROR: 'DATABASE_MIGRATION_ERROR',
  DATABASE_VALIDATION_ERROR: 'DATABASE_VALIDATION_ERROR',
});

export function createDatabaseError(code, message = 'Database foundation error.', metadata = {}) {
  return new KhedmahCoreError({
    code,
    message,
    category: ErrorCategory.SYSTEM,
    metadata: Object.freeze({ safe: true, internalDetailsExposed: false, ...metadata }),
  });
}
