import assert from 'node:assert/strict';
<<<<<<< HEAD
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
=======
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory } from '../backend/core/errors/base-error.mjs';
import { ProfileErrorCode } from '../backend/modules/profiles/domain/errors.mjs';
import {
  APPROVED_PROFILE_PERSISTENCE_LIFECYCLES,
  APPROVED_PROFILE_PERSISTENCE_TYPES,
  APPROVED_PROFILE_PERSISTENCE_VISIBILITIES,
  assertUniqueProfileOwnership,
  createProfileRepository,
  ProfileColumn,
  ProfileTable,
  validateProfilePersistenceLifecycleTransition,
  validateProfilePersistenceRecord,
} from '../backend/modules/profiles/repositories/profile-repository.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const forwardPath = 'backend/migrations/versions/002_create_profiles.sql';
const rollbackPath = 'backend/migrations/versions/002_create_profiles_rollback.sql';

test('Migration 002 uses the governed forward and rollback names', async () => {
  const [forward, rollback] = await Promise.all([read(forwardPath), read(rollbackPath)]);
  assert.match(forwardPath, /^backend\/migrations\/versions\/002_[a-z][a-z0-9_]*\.sql$/);
  assert.match(rollbackPath, /^backend\/migrations\/versions\/002_[a-z][a-z0-9_]*_rollback\.sql$/);
  assert.match(forward, /CREATE TABLE profiles/);
  assert.match(rollback, /DROP TABLE IF EXISTS profiles/);
});

test('profiles schema contains exactly the approved physical fields', async () => {
  const forward = await read(forwardPath);
  const body = forward.match(/CREATE TABLE profiles \(([\s\S]*?)\n\);/)?.[1] || '';
  const approved = Object.values(ProfileColumn);
  for (const column of approved) assert.match(body, new RegExp(`\\b${column}\\b`));
  for (const forbidden of ['email', 'password', 'token', 'contact', 'business_name', 'profession_type', 'organization_identifier', 'payment', 'financial']) assert.doesNotMatch(body, new RegExp(`\\b${forbidden}\\b`, 'i'));
  assert.deepEqual(approved, ['profile_identifier', 'user_identifier', 'profile_type', 'display_name', 'lifecycle_status', 'visibility', 'created_at', 'updated_at', 'archived_at']);
});

test('profiles require one non-cascading user owner relationship', async () => {
  const forward = await read(forwardPath);
  assert.match(forward, /user_identifier TEXT NOT NULL UNIQUE/);
  assert.match(forward, /FOREIGN KEY \(user_identifier\) REFERENCES core_user_accounts\(user_identifier\) ON DELETE RESTRICT/);
  assert.match(forward, /CONSTRAINT profiles_identifier_owner_unique UNIQUE \(profile_identifier, user_identifier\)/);
  assert.doesNotMatch(forward, /ON DELETE CASCADE/i);
  assert.equal(ProfileTable.uniqueOwnerReference, 'user_identifier');
  assert.equal(ProfileTable.ownerDeletion, 'RESTRICT');
});

test('profile types are reference values and create no related entities', async () => {
  const forward = await read(forwardPath);
  assert.deepEqual(APPROVED_PROFILE_PERSISTENCE_TYPES, ['personal_profile', 'professional_profile', 'business_profile', 'organization_profile', 'partner_profile', 'representative_profile']);
  for (const type of APPROVED_PROFILE_PERSISTENCE_TYPES) assert.match(forward, new RegExp(`'${type}'`));
  assert.doesNotMatch(forward, /CREATE TABLE (professional_profiles|business_profiles|organizations)/);
});

test('lifecycle and visibility use constrained classification values without triggers', async () => {
  const forward = await read(forwardPath);
  assert.deepEqual(APPROVED_PROFILE_PERSISTENCE_LIFECYCLES, ['created', 'pending', 'active', 'suspended', 'archived']);
  assert.deepEqual(APPROVED_PROFILE_PERSISTENCE_VISIBILITIES, ['public', 'private', 'internal']);
  for (const value of [...APPROVED_PROFILE_PERSISTENCE_LIFECYCLES, ...APPROVED_PROFILE_PERSISTENCE_VISIBILITIES]) assert.match(forward, new RegExp(`'${value}'`));
  assert.doesNotMatch(forward, /CREATE\s+(OR REPLACE\s+)?(FUNCTION|TRIGGER)/i);
  assert.equal(ProfileTable.visibilityIsAuthorization, false);
  assert.equal(validateProfilePersistenceLifecycleTransition('created', 'pending').valid, true);
  assert.equal(validateProfilePersistenceLifecycleTransition('archived', 'active').valid, false);
});

test('index strategy uses constraints plus lifecycle and visibility indexes only', async () => {
  const forward = await read(forwardPath);
  assert.match(forward, /profile_identifier TEXT PRIMARY KEY/);
  assert.match(forward, /user_identifier TEXT NOT NULL UNIQUE/);
  assert.match(forward, /CREATE INDEX profiles_lifecycle_status_idx ON profiles\(lifecycle_status\)/);
  assert.match(forward, /CREATE INDEX profiles_visibility_idx ON profiles\(visibility\)/);
  assert.doesNotMatch(forward, /(ranking|analytics|search_rank)/i);
  assert.equal((forward.match(/CREATE INDEX/g) || []).length, 2);
});

test('persistence validation accepts approved records and rejects every governed boundary', () => {
  const valid = {
    profileIdentifier: 'profile_Abcdefgh',
    userIdentifier: 'user.valid-001',
    profileType: 'personal_profile',
    displayName: 'اسم مستخدم',
    lifecycleStatus: 'created',
    visibility: 'private',
  };
  assert.equal(validateProfilePersistenceRecord(valid).valid, true);
  for (const [field, value] of Object.entries({ profileIdentifier: 'bad', userIdentifier: '!', profileType: 'seller_profile', displayName: ' ', lifecycleStatus: 'deleted', visibility: 'followers' })) {
    assert.equal(validateProfilePersistenceRecord({ ...valid, [field]: value }).valid, false, field);
  }
});

test('repository provides lookup abstraction, duplicate checks, and safe compatible errors', () => {
  const client = {
    findProfileByIdentifier: (identifier) => ({ profileIdentifier: identifier }),
    findProfileByUserIdentifier: (identifier) => ({ userIdentifier: identifier }),
  };
  const repository = createProfileRepository({ databaseClient: client });
  assert.deepEqual(repository.findByIdentifier('profile_Abcdefgh'), { profileIdentifier: 'profile_Abcdefgh' });
  assert.deepEqual(repository.findByUserIdentifier('user.valid-001'), { userIdentifier: 'user.valid-001' });
  assert.equal(repository.exposesHttpLogic, false);
  assert.equal(repository.implementsAuthentication, false);
  assert.equal(repository.implementsBusinessWorkflow, false);
  assert.equal(assertUniqueProfileOwnership([{ profileIdentifier: 'profile_Abcdefgh', userIdentifier: 'user.one' }, { profileIdentifier: 'profile_Ijklmnop', userIdentifier: 'user.one' }]).valid, false);
  assert.equal(repository.createDuplicateError().code, ProfileErrorCode.PROFILE_DUPLICATE);
  assert.equal(repository.createUserReferenceError().code, ProfileErrorCode.PROFILE_USER_REFERENCE_INVALID);
  assert.equal(repository.createUserReferenceError().category, ErrorCategory.RELATIONSHIP);
  assert.deepEqual(repository.createUserReferenceError().metadata, {});
});

test('rollback is scoped to Profile objects and preserves all other entities', async () => {
  const rollback = await read(rollbackPath);
  assert.match(rollback, /DROP INDEX IF EXISTS profiles_visibility_idx/);
  assert.match(rollback, /DROP INDEX IF EXISTS profiles_lifecycle_status_idx/);
  assert.equal((rollback.match(/DROP TABLE/g) || []).length, 1);
  assert.doesNotMatch(rollback, /(core_user_accounts|professional_profiles|business_profiles|organizations|CASCADE)/i);
});

test('security and KILL CRITICAL exclusions remain explicit in repository metadata', () => {
  assert.deepEqual({
    passwords: ProfileTable.storesPasswords,
    credentials: ProfileTable.storesCredentials,
    tokens: ProfileTable.storesTokens,
    sessions: ProfileTable.storesSessions,
    privateContacts: ProfileTable.storesPrivateContacts,
    financialData: ProfileTable.storesFinancialData,
  }, { passwords: false, credentials: false, tokens: false, sessions: false, privateContacts: false, financialData: false });
>>>>>>> origin/main
});
