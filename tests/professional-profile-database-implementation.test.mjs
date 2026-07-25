import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory } from '../backend/core/errors/base-error.mjs';
import { ProfessionalProfileErrorCode } from '../backend/modules/professional_profiles/domain/errors.mjs';
import {
  APPROVED_PROFESSION_PERSISTENCE_TYPES,
  APPROVED_PROFESSIONAL_PROFILE_LIFECYCLES,
  APPROVED_PROFESSIONAL_PROFILE_VISIBILITIES,
  assertUniqueProfessionalProfileIdentity,
  createProfessionalProfileRepository,
  ProfessionalProfileColumn,
  ProfessionalProfileTable,
  validateProfessionalProfilePersistenceLifecycleTransition,
  validateProfessionalProfilePersistenceRecord,
} from '../backend/modules/professional_profiles/repositories/professional-profile-repository.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const forwardPath = 'backend/migrations/versions/003_create_professional_profiles.sql';
const rollbackPath = 'backend/migrations/versions/003_create_professional_profiles_rollback.sql';

test('Migration 003 uses governed forward and rollback names', async () => {
  const [forward, rollback] = await Promise.all([read(forwardPath), read(rollbackPath)]);
  assert.match(forwardPath, /^backend\/migrations\/versions\/003_[a-z][a-z0-9_]*\.sql$/);
  assert.match(rollbackPath, /^backend\/migrations\/versions\/003_[a-z][a-z0-9_]*_rollback\.sql$/);
  assert.match(forward, /CREATE TABLE professional_profiles/);
  assert.match(rollback, /DROP TABLE IF EXISTS professional_profiles/);
});

test('professional_profiles contains exactly the approved fields', async () => {
  const forward = await read(forwardPath);
  const body = forward.match(/CREATE TABLE professional_profiles \(([\s\S]*?)\n\);/)?.[1] || '';
  const approved = Object.values(ProfessionalProfileColumn);
  assert.deepEqual(approved, ['professional_profile_identifier', 'profile_identifier', 'user_identifier', 'profession_type', 'lifecycle_status', 'visibility', 'created_at', 'updated_at', 'archived_at']);
  for (const field of approved) assert.match(body, new RegExp(`\\b${field}\\b`));
  for (const forbidden of ['certificate', 'license', 'qualification', 'experience', 'document', 'verification', 'service', 'price', 'payment']) assert.doesNotMatch(body, new RegExp(`\\b${forbidden}`, 'i'));
});

test('profile relationship is unique, ownership-consistent, and non-cascading', async () => {
  const [profiles, professional] = await Promise.all([read('backend/migrations/versions/002_create_profiles.sql'), read(forwardPath)]);
  assert.match(profiles, /UNIQUE \(profile_identifier, user_identifier\)/);
  assert.match(professional, /profile_identifier TEXT NOT NULL UNIQUE/);
  assert.match(professional, /FOREIGN KEY \(profile_identifier, user_identifier\) REFERENCES profiles\(profile_identifier, user_identifier\) ON DELETE RESTRICT/);
  assert.doesNotMatch(professional, /ON DELETE CASCADE/i);
  assert.equal(ProfessionalProfileTable.parentDeletion, 'RESTRICT');
});

test('profession types are reference values without workflows', async () => {
  const forward = await read(forwardPath);
  assert.deepEqual(APPROVED_PROFESSION_PERSISTENCE_TYPES, ['doctor', 'dentist', 'engineer', 'lawyer', 'consultant', 'freelancer', 'technical_specialist']);
  for (const type of APPROVED_PROFESSION_PERSISTENCE_TYPES) assert.match(forward, new RegExp(`'${type}'`));
  assert.doesNotMatch(forward, /(other_professional|CREATE TABLE (certificates|licenses|bookings))/);
});

test('lifecycle and visibility are constrained classifications without triggers', async () => {
  const forward = await read(forwardPath);
  assert.deepEqual(APPROVED_PROFESSIONAL_PROFILE_LIFECYCLES, ['created', 'pending', 'active', 'suspended', 'archived']);
  assert.deepEqual(APPROVED_PROFESSIONAL_PROFILE_VISIBILITIES, ['public', 'private', 'internal']);
  for (const value of [...APPROVED_PROFESSIONAL_PROFILE_LIFECYCLES, ...APPROVED_PROFESSIONAL_PROFILE_VISIBILITIES]) assert.match(forward, new RegExp(`'${value}'`));
  assert.doesNotMatch(forward, /CREATE\s+(OR REPLACE\s+)?(FUNCTION|TRIGGER)/i);
  assert.equal(ProfessionalProfileTable.visibilityIsAuthorization, false);
  assert.equal(ProfessionalProfileTable.implementsVerification, false);
  assert.equal(validateProfessionalProfilePersistenceLifecycleTransition('pending', 'active').valid, true);
  assert.equal(validateProfessionalProfilePersistenceLifecycleTransition('archived', 'active').valid, false);
});

test('index strategy uses uniqueness plus only approved secondary indexes', async () => {
  const forward = await read(forwardPath);
  assert.match(forward, /professional_profile_identifier TEXT PRIMARY KEY/);
  assert.match(forward, /profile_identifier TEXT NOT NULL UNIQUE/);
  for (const index of ['user_identifier', 'profession_type', 'lifecycle_status', 'visibility']) assert.match(forward, new RegExp(`CREATE INDEX professional_profiles_${index}_idx ON professional_profiles\\(${index}\\)`));
  assert.equal((forward.match(/CREATE INDEX/g) || []).length, 4);
  assert.doesNotMatch(forward, /(ranking|search_rank|advertising|analytics)/i);
});

test('persistence validation accepts approved records and rejects invalid boundaries', () => {
  const valid = {
    professionalProfileIdentifier: 'professional_profile_Abcdefgh',
    profileIdentifier: 'profile_Abcdefgh',
    userIdentifier: 'user.valid-001',
    professionType: 'engineer',
    lifecycleStatus: 'created',
    visibility: 'private',
  };
  assert.equal(validateProfessionalProfilePersistenceRecord(valid).valid, true);
  for (const [field, value] of Object.entries({ professionalProfileIdentifier: 'bad', profileIdentifier: 'bad', userIdentifier: '!', professionType: 'seller', lifecycleStatus: 'deleted', visibility: 'verified' })) {
    assert.equal(validateProfessionalProfilePersistenceRecord({ ...valid, [field]: value }).valid, false, field);
  }
});

test('repository provides safe metadata, duplicates, lookups, and compatible errors', () => {
  const client = {
    findProfessionalProfileByIdentifier: (value) => ({ professionalProfileIdentifier: value }),
    findProfessionalProfileByProfileIdentifier: (value) => ({ profileIdentifier: value }),
    findProfessionalProfilesByUserIdentifier: (value) => [{ userIdentifier: value }],
  };
  const repository = createProfessionalProfileRepository({ databaseClient: client });
  assert.equal(repository.findByIdentifier('professional_profile_Abcdefgh').professionalProfileIdentifier, 'professional_profile_Abcdefgh');
  assert.equal(repository.findByProfileIdentifier('profile_Abcdefgh').profileIdentifier, 'profile_Abcdefgh');
  assert.equal(repository.findByUserIdentifier('user.valid-001')[0].userIdentifier, 'user.valid-001');
  assert.equal(repository.exposesApiLogic, false);
  assert.equal(repository.implementsAuthentication, false);
  assert.equal(repository.implementsVerificationWorkflow, false);
  assert.equal(repository.implementsBusinessWorkflow, false);
  assert.equal(assertUniqueProfessionalProfileIdentity([{ professionalProfileIdentifier: 'professional_profile_Abcdefgh', profileIdentifier: 'profile_Abcdefgh' }, { professionalProfileIdentifier: 'professional_profile_Ijklmnop', profileIdentifier: 'profile_Abcdefgh' }]).valid, false);
  assert.equal(repository.createDuplicateError().code, ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE);
  assert.equal(repository.createProfileReferenceError().code, ProfessionalProfileErrorCode.PROFILE_REFERENCE_INVALID);
  assert.equal(repository.createProfileReferenceError().category, ErrorCategory.RELATIONSHIP);
  assert.deepEqual(repository.createProfileReferenceError().metadata, {});
});

test('rollback removes only professional profile objects', async () => {
  const rollback = await read(rollbackPath);
  for (const index of ['visibility', 'lifecycle_status', 'profession_type', 'user_identifier']) assert.match(rollback, new RegExp(`DROP INDEX IF EXISTS professional_profiles_${index}_idx`));
  assert.equal((rollback.match(/DROP TABLE/g) || []).length, 1);
  assert.doesNotMatch(rollback, /(DROP TABLE IF EXISTS (profiles|core_user_accounts|business_profiles|organizations)|CASCADE)/i);
});

test('security and KILL CRITICAL exclusions are explicit', () => {
  assert.deepEqual({
    passwords: ProfessionalProfileTable.storesPasswords,
    tokens: ProfessionalProfileTable.storesTokens,
    credentials: ProfessionalProfileTable.storesCredentials,
    sessions: ProfessionalProfileTable.storesSessions,
    privateDocuments: ProfessionalProfileTable.storesPrivateDocuments,
    certificates: ProfessionalProfileTable.storesCertificates,
    financialInformation: ProfessionalProfileTable.storesFinancialInformation,
  }, { passwords: false, tokens: false, credentials: false, sessions: false, privateDocuments: false, certificates: false, financialInformation: false });
});
