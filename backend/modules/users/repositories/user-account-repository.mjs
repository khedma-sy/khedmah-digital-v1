import { createDatabaseError, DatabaseErrorCode } from '../../../database/errors/database-errors.mjs';
import { canTransitionUserLifecycle } from '../domain/user-lifecycle.mjs';
import { UserAccountErrorCode, createUserAccountError } from '../domain/user-errors.mjs';
import { validateUserAccountFoundation } from '../schemas/user-account-validation.mjs';

export const UserAccountTable = Object.freeze({
  name: 'core_user_accounts',
  primaryKey: 'user_identifier',
  uniqueIdentityReference: 'identity_reference',
  storesPasswords: false,
  storesTokens: false,
  storesSecrets: false,
  storesProfileData: false,
  storesBusinessData: false,
});

export const UserAccountColumn = Object.freeze({
  USER_IDENTIFIER: 'user_identifier',
  IDENTITY_REFERENCE: 'identity_reference',
  ACCOUNT_TYPE: 'account_type',
  ACCOUNT_STATUS: 'account_status',
  LIFECYCLE_STATUS: 'lifecycle_status',
  VISIBILITY_CLASSIFICATION: 'visibility_classification',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  ARCHIVED_AT: 'archived_at',
});

export function validateUserAccountPersistenceRecord(input) {
  const value = input || {};
  return validateUserAccountFoundation({
    userIdentifier: value.userIdentifier,
    identityReference: value.identityReference,
    accountType: value.accountType,
    accountStatus: value.accountStatus,
    lifecycleState: value.lifecycleStatus,
    visibility: value.visibilityClassification,
  });
}

export function assertUniqueIdentityOwnership(records = []) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    if (!record?.identityReference) continue;
    if (seen.has(record.identityReference)) duplicates.push(record.identityReference);
    seen.add(record.identityReference);
  }
  return Object.freeze({ valid: duplicates.length === 0, duplicates: Object.freeze(duplicates) });
}

export function validateUserAccountPersistenceLifecycleTransition(from, to) {
  const valid = canTransitionUserLifecycle(from, to);
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'lifecycleStatus', code: UserAccountErrorCode.USER_ACCOUNT_LIFECYCLE_INVALID, message: 'User account lifecycle transition is not allowed.' }]) });
}

export function createUserAccountRepository({ databaseClient } = {}) {
  return Object.freeze({
    table: UserAccountTable,
    hasDatabaseClient: Boolean(databaseClient),
    exposesApiLogic: false,
    implementsAuthentication: false,
    implementsBusinessLogic: false,
    validate(record) {
      return validateUserAccountPersistenceRecord(record);
    },
    createDuplicateError(identityReference) {
      return createUserAccountError(UserAccountErrorCode.USER_ACCOUNT_DUPLICATE, 'User account identity reference already exists.', { identityReference });
    },
    createDatabaseValidationError(metadata = {}) {
      return createDatabaseError(DatabaseErrorCode.DATABASE_VALIDATION_ERROR, 'User account database validation failed.', metadata);
    },
  });
}
