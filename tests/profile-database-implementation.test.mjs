import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { DatabaseErrorCode } from '../backend/database/errors/database-errors.mjs';
import { ProfileErrorCode } from '../backend/modules/profiles/domain/errors.mjs';
import { ProfileStatus, ProfileType, ProfileVisibility } from '../backend/modules/profiles/domain/profile-types.mjs';
import { assertUniqueProfileOwnership, createProfileRepository, ProfileColumn, ProfileTable, validateProfilePersistenceLifecycleTransition, validateProfilePersistenceRecord } from '../backend/modules/profiles/repositories/profile-repository.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const validRecord = Object.freeze({
  profileIdentifier: 'profile_001',
  userIdentifier: 'user_001',
  profileType: ProfileType.PERSONAL,
  visibility: ProfileVisibility.PRIVATE,
  lifecycleStatus: ProfileStatus.CREATED,
});

test('Mission 068 creates migration 002 and its rollback with approved names', async () => {
  const files = await readdir(new URL('../backend/migrations/versions/', import.meta.url));
  assert.ok(files.includes('002_create_profiles.sql'));
  assert.ok(files.includes('002_create_profiles_rollback.sql'));
});

test('profile migration contains only approved base profile fields and constraints', async () => {
  const sql = await read('backend/migrations/versions/002_create_profiles.sql');
  assert.match(sql, /CREATE TABLE profiles/);
  for (const field of ['profile_identifier', 'user_identifier', 'profile_type', 'visibility', 'lifecycle_status', 'created_at', 'updated_at']) assert.match(sql, new RegExp(field));
  const ddl = sql.split('CREATE TABLE profiles')[1];
  assert.doesNotMatch(ddl, /display_name|email|phone|address|biography|document|password|token|secret|credential/i);
});

test('profile relationship requires an existing user and prevents duplicate ownership', async () => {
  const sql = await read('backend/migrations/versions/002_create_profiles.sql');
  assert.match(sql, /user_identifier TEXT NOT NULL UNIQUE/);
  assert.match(sql, /FOREIGN KEY \(user_identifier\)\s+REFERENCES core_user_accounts\(user_identifier\)/);
  assert.equal(assertUniqueProfileOwnership([validRecord]).valid, true);
  assert.equal(assertUniqueProfileOwnership([validRecord, validRecord]).valid, false);
  assert.equal(ProfileTable.userReferenceTable, 'core_user_accounts');
});

test('profile type values are references and create no specialized profile entities', async () => {
  const sql = await read('backend/migrations/versions/002_create_profiles.sql');
  for (const profileType of Object.values(ProfileType)) assert.match(sql, new RegExp(`'${profileType}'`));
  assert.equal(ProfileTable.createsSpecializedProfileEntities, false);
  assert.doesNotMatch(sql, /CREATE TABLE (professional_profiles|business_profiles|organizations)/i);
});

test('profile lifecycle and visibility constraints use approved values', async () => {
  const sql = await read('backend/migrations/versions/002_create_profiles.sql');
  for (const value of [...Object.values(ProfileStatus), ...Object.values(ProfileVisibility)]) assert.match(sql, new RegExp(`'${value}'`));
  assert.match(sql, /profiles_archived_at_required/);
  assert.equal(validateProfilePersistenceLifecycleTransition(ProfileStatus.CREATED, ProfileStatus.PENDING).valid, true);
  assert.equal(validateProfilePersistenceLifecycleTransition(ProfileStatus.ARCHIVED, ProfileStatus.ACTIVE).valid, false);
});

test('profile persistence validation integrates required identifier type visibility and lifecycle checks', () => {
  assert.equal(validateProfilePersistenceRecord(validRecord).valid, true);
  const invalid = validateProfilePersistenceRecord({ profileIdentifier: 'bad id', userIdentifier: '', profileType: 'social_profile', visibility: 'exposed', lifecycleStatus: 'tracked' });
  assert.equal(invalid.valid, false);
  for (const field of ['profileIdentifier', 'userIdentifier', 'profileType', 'visibility', 'lifecycleStatus']) assert.ok(invalid.errors.some((error) => error.field === field));
});

test('profile repository is persistence-only and returns core-compatible safe errors', () => {
  const repository = createProfileRepository({ databaseClient: {} });
  assert.equal(repository.table.name, 'profiles');
  assert.equal(repository.hasDatabaseClient, true);
  assert.equal(repository.exposesApiLogic, false);
  assert.equal(repository.implementsAuthentication, false);
  assert.equal(repository.implementsBusinessLogic, false);
  assert.equal(repository.validate(validRecord).valid, true);
  assert.equal(ProfileColumn.USER_IDENTIFIER, 'user_identifier');
  const errors = [repository.createDuplicateError('user_001'), repository.createUserReferenceError('missing'), repository.createVisibilityError('exposed'), repository.createDatabaseValidationError()];
  assert.ok(errors.every((error) => error instanceof KhedmahCoreError));
  assert.deepEqual(errors.map((error) => error.code), [ProfileErrorCode.PROFILE_DUPLICATE, ProfileErrorCode.PROFILE_USER_REFERENCE_INVALID, ProfileErrorCode.PROFILE_VISIBILITY_INVALID, DatabaseErrorCode.DATABASE_VALIDATION_ERROR]);
  assert.equal(errors[0].category, ErrorCategory.DUPLICATE);
  assert.equal(errors[1].category, ErrorCategory.RELATIONSHIP);
  assert.equal(errors[3].metadata.internalDetailsExposed, false);
});

test('rollback is reversible and affects only Mission 068 profile objects', async () => {
  const rollback = await read('backend/migrations/versions/002_create_profiles_rollback.sql');
  assert.match(rollback, /DROP INDEX IF EXISTS profiles_lifecycle_status_idx/);
  assert.match(rollback, /DROP TABLE IF EXISTS profiles/);
  assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS (core_user_accounts|professional_profiles|business_profiles|organizations|services|locations|payments|marketplace)/i);
});

test('security and KILL CRITICAL boundaries exclude private data and forbidden tables', async () => {
  const sql = await read('backend/migrations/versions/002_create_profiles.sql');
  const repository = await read('backend/modules/profiles/repositories/profile-repository.mjs');
  assert.equal(ProfileTable.storesPrivateProfileData, false);
  assert.equal(ProfileTable.storesPasswords, false);
  assert.equal(ProfileTable.storesTokens, false);
  assert.equal(ProfileTable.storesSecrets, false);
  assert.equal(ProfileTable.storesCredentials, false);
  assert.doesNotMatch(`${sql}\n${repository}`, /CREATE TABLE (professional_profiles|business_profiles|organizations|marketplace|payments|commissions|social_profiles|tracking)/i);
  assert.doesNotMatch(repository, /jwt|login|@Controller|@Post|frontend/i);
});
