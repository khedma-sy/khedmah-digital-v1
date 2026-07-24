import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { DatabaseErrorCode } from '../backend/database/errors/database-errors.mjs';
import { AccountStatus, AccountType, LifecycleState } from '../backend/modules/identity/domain/identity-types.mjs';
import { UserVisibilityClassification } from '../backend/modules/users/domain/user-account-types.mjs';
import { UserAccountErrorCode } from '../backend/modules/users/domain/user-errors.mjs';
import { assertUniqueIdentityOwnership, createUserAccountRepository, UserAccountColumn, UserAccountTable, validateUserAccountPersistenceLifecycleTransition, validateUserAccountPersistenceRecord } from '../backend/modules/users/repositories/user-account-repository.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validRecord = Object.freeze({
  userIdentifier: 'user_001',
  identityReference: 'identity_user_0001',
  accountType: AccountType.INDIVIDUAL_USER,
  accountStatus: AccountStatus.CREATED,
  lifecycleStatus: LifecycleState.CREATED,
  visibilityClassification: UserVisibilityClassification.PRIVATE,
});

test('Mission 067 creates migration 001 and rollback migration using approved naming', async () => {
  const files = await readdir(new URL('../backend/migrations/versions/', import.meta.url));
  assert.ok(files.includes('001_core_identity_accounts.sql'));
  assert.ok(files.includes('001_core_identity_accounts_rollback.sql'));
});

test('core identity migration creates only approved user account storage fields', async () => {
  const sql = await read('backend/migrations/versions/001_core_identity_accounts.sql');
  assert.match(sql, /CREATE TABLE core_user_accounts/);
  for (const field of ['user_identifier', 'identity_reference', 'account_type', 'account_status', 'lifecycle_status', 'visibility_classification', 'created_at', 'updated_at']) {
    assert.match(sql, new RegExp(field));
  }
  const ddl = sql.split('CREATE TABLE core_user_accounts')[1];
  assert.doesNotMatch(ddl, /password_hash|token_hash|secret_value|credential_value|profile_name|business_name|organization_name|service_name/i);
});

test('identity reference compatibility prevents duplicate ownership and embedded profile business data', async () => {
  const sql = await read('backend/migrations/versions/001_core_identity_accounts.sql');
  assert.match(sql, /identity_reference TEXT NOT NULL UNIQUE/);
  assert.match(sql, /core_user_accounts_identity_reference_format/);
  assert.equal(assertUniqueIdentityOwnership([validRecord]).valid, true);
  assert.equal(assertUniqueIdentityOwnership([validRecord, validRecord]).valid, false);
  assert.equal(UserAccountTable.storesProfileData, false);
  assert.equal(UserAccountTable.storesBusinessData, false);
});

test('lifecycle constraints support approved states without workflow engine', async () => {
  const sql = await read('backend/migrations/versions/001_core_identity_accounts.sql');
  for (const state of Object.values(LifecycleState)) {
    assert.match(sql, new RegExp(`'${state}'`));
  }
  assert.match(sql, /core_user_accounts_archived_at_required/);
  assert.equal(validateUserAccountPersistenceLifecycleTransition(LifecycleState.CREATED, LifecycleState.PENDING).valid, true);
  assert.equal(validateUserAccountPersistenceLifecycleTransition(LifecycleState.ARCHIVED, LifecycleState.ACTIVE).valid, false);
});

test('user account persistence validation checks required fields account type status lifecycle and visibility', () => {
  assert.equal(validateUserAccountPersistenceRecord(validRecord).valid, true);
  const invalid = validateUserAccountPersistenceRecord({ userIdentifier: 'bad ref', identityReference: 'profile_001', accountType: 'seller_account', accountStatus: 'paid', lifecycleStatus: 'tracked', visibilityClassification: 'marketplace' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'userIdentifier'));
  assert.ok(invalid.errors.some((error) => error.field === 'identityReference'));
  assert.ok(invalid.errors.some((error) => error.field === 'accountType'));
  assert.ok(invalid.errors.some((error) => error.field === 'accountStatus'));
  assert.ok(invalid.errors.some((error) => error.field === 'lifecycleState'));
  assert.ok(invalid.errors.some((error) => error.field === 'visibility'));
});

test('repository foundation exposes database abstraction without API authentication or business logic', () => {
  const repository = createUserAccountRepository({ databaseClient: {} });
  assert.equal(repository.table.name, 'core_user_accounts');
  assert.equal(repository.hasDatabaseClient, true);
  assert.equal(repository.exposesApiLogic, false);
  assert.equal(repository.implementsAuthentication, false);
  assert.equal(repository.implementsBusinessLogic, false);
  assert.equal(repository.validate(validRecord).valid, true);
  assert.equal(UserAccountColumn.USER_IDENTIFIER, 'user_identifier');
  assert.equal(UserAccountColumn.IDENTITY_REFERENCE, 'identity_reference');
});

test('error integration supports database validation duplicate and lifecycle errors safely', () => {
  const repository = createUserAccountRepository();
  const databaseError = repository.createDatabaseValidationError({ table: UserAccountTable.name });
  const duplicateError = repository.createDuplicateError(validRecord.identityReference);
  assert.ok(databaseError instanceof KhedmahCoreError);
  assert.ok(duplicateError instanceof KhedmahCoreError);
  assert.equal(databaseError.code, DatabaseErrorCode.DATABASE_VALIDATION_ERROR);
  assert.equal(databaseError.metadata.internalDetailsExposed, false);
  assert.equal(duplicateError.code, UserAccountErrorCode.USER_ACCOUNT_DUPLICATE);
  assert.equal(duplicateError.category, ErrorCategory.DUPLICATE);
  const lifecycle = validateUserAccountPersistenceLifecycleTransition(LifecycleState.ARCHIVED, LifecycleState.ACTIVE);
  assert.equal(lifecycle.errors[0].code, UserAccountErrorCode.USER_ACCOUNT_LIFECYCLE_INVALID);
});

test('rollback migration is reversible and limited to Mission 067 objects', async () => {
  const rollback = await read('backend/migrations/versions/001_core_identity_accounts_rollback.sql');
  assert.match(rollback, /DROP INDEX IF EXISTS core_user_accounts_lifecycle_status_idx/);
  assert.match(rollback, /DROP TABLE IF EXISTS core_user_accounts/);
  assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS (users|profiles|organizations|services|payments|marketplace|orders|commissions|advertising|social|tracking)/i);
});

test('security and KILL CRITICAL boundaries exclude forbidden account systems', async () => {
  const sql = await read('backend/migrations/versions/001_core_identity_accounts.sql');
  const repository = await read('backend/modules/users/repositories/user-account-repository.mjs');
  const content = `${sql}\n${repository}`;
  assert.equal(UserAccountTable.storesPasswords, false);
  assert.equal(UserAccountTable.storesTokens, false);
  assert.equal(UserAccountTable.storesSecrets, false);
  assert.doesNotMatch(content, /payment_account|marketplace_account|seller_account|commission_account|advertising_account|social_profile|tracking_profile/i);
  assert.doesNotMatch(content, /jwt|login|authentication service|@Controller|@Post|frontend/i);
});
