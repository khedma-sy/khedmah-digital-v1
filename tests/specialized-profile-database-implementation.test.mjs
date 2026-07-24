import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { DatabaseErrorCode } from '../backend/database/errors/database-errors.mjs';
import { assertUniqueBusinessProfileOwnership, BusinessProfileTable, createBusinessProfileRepository, validateBusinessBaseProfileType, validateBusinessPersistenceLifecycleTransition, validateBusinessProfilePersistenceRecord } from '../backend/modules/business_profiles/repositories/business-profile-repository.mjs';
import { BusinessProfileErrorCode } from '../backend/modules/business_profiles/domain/errors.mjs';
import { BusinessStatus, BusinessType, BusinessVisibility } from '../backend/modules/business_profiles/domain/business-types.mjs';
import { assertUniqueProfessionalProfileOwnership, createProfessionalProfileRepository, ProfessionalProfileTable, validateProfessionalBaseProfileType, validateProfessionalPersistenceLifecycleTransition, validateProfessionalProfilePersistenceRecord } from '../backend/modules/professional_profiles/repositories/professional-profile-repository.mjs';
import { ProfessionalProfileErrorCode } from '../backend/modules/professional_profiles/domain/errors.mjs';
import { ProfessionType, ProfessionalStatus, ProfessionalVisibility } from '../backend/modules/professional_profiles/domain/professional-types.mjs';
import { ProfileErrorCode } from '../backend/modules/profiles/domain/errors.mjs';
import { ProfileType } from '../backend/modules/profiles/domain/profile-types.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const professionalRecord = Object.freeze({ professionalProfileIdentifier: 'professional_001', profileIdentifier: 'profile_001', professionType: ProfessionType.ENGINEER, professionalStatus: ProfessionalStatus.ACTIVE, visibility: ProfessionalVisibility.PUBLIC, lifecycleStatus: ProfessionalStatus.ACTIVE });
const businessRecord = Object.freeze({ businessProfileIdentifier: 'business_001', profileIdentifier: 'profile_002', businessType: BusinessType.SERVICE_BUSINESS, businessStatus: BusinessStatus.ACTIVE, visibility: BusinessVisibility.PUBLIC, lifecycleStatus: BusinessStatus.ACTIVE });

test('Mission 069 creates migrations 003 and 004 with dedicated rollbacks', async () => {
  const files = await readdir(new URL('../backend/migrations/versions/', import.meta.url));
  for (const file of ['003_create_professional_profiles.sql', '003_create_professional_profiles_rollback.sql', '004_create_business_profiles.sql', '004_create_business_profiles_rollback.sql']) assert.ok(files.includes(file));
});

test('professional profile schema contains only approved fields and constraints', async () => {
  const sql = await read('backend/migrations/versions/003_create_professional_profiles.sql');
  assert.match(sql, /CREATE TABLE professional_profiles/);
  for (const field of ['professional_profile_identifier', 'profile_identifier', 'profession_type', 'professional_status', 'visibility', 'lifecycle_status', 'created_at', 'updated_at']) assert.match(sql, new RegExp(field));
  for (const type of Object.values(ProfessionType)) assert.match(sql, new RegExp(`'${type}'`));
  assert.match(sql, /professional_profiles_status_lifecycle_match/);
  assert.doesNotMatch(sql.split('CREATE TABLE professional_profiles')[1], /certificate|license|document|verification_evidence|service_identifier/i);
});

test('business profile schema contains only approved fields and constraints', async () => {
  const sql = await read('backend/migrations/versions/004_create_business_profiles.sql');
  assert.match(sql, /CREATE TABLE business_profiles/);
  for (const field of ['business_profile_identifier', 'profile_identifier', 'business_type', 'business_status', 'visibility', 'lifecycle_status', 'created_at', 'updated_at']) assert.match(sql, new RegExp(field));
  for (const type of Object.values(BusinessType)) assert.match(sql, new RegExp(`'${type}'`));
  assert.match(sql, /business_profiles_status_lifecycle_match/);
  assert.doesNotMatch(sql.split('CREATE TABLE business_profiles')[1], /product|inventory|order|payment|financial/i);
});

test('specialized profiles require unique base profile foreign references', async () => {
  const professionalSql = await read('backend/migrations/versions/003_create_professional_profiles.sql');
  const businessSql = await read('backend/migrations/versions/004_create_business_profiles.sql');
  for (const sql of [professionalSql, businessSql]) {
    assert.match(sql, /profile_identifier TEXT NOT NULL UNIQUE/);
    assert.match(sql, /FOREIGN KEY \(profile_identifier\)\s+REFERENCES profiles\(profile_identifier\)/);
  }
  assert.equal(assertUniqueProfessionalProfileOwnership([professionalRecord, professionalRecord]).valid, false);
  assert.equal(assertUniqueBusinessProfileOwnership([businessRecord, businessRecord]).valid, false);
});

test('base profile type validation prevents invalid profile conversion', () => {
  assert.equal(validateProfessionalBaseProfileType(ProfileType.PROFESSIONAL).valid, true);
  assert.equal(validateProfessionalBaseProfileType(ProfileType.BUSINESS).valid, false);
  assert.equal(validateBusinessBaseProfileType(ProfileType.BUSINESS).valid, true);
  assert.equal(validateBusinessBaseProfileType(ProfileType.PERSONAL).valid, false);
  assert.equal(validateBusinessBaseProfileType(ProfileType.PERSONAL).errors[0].code, ProfileErrorCode.PROFILE_REFERENCE_INVALID);
});

test('persistence validation checks types statuses visibility lifecycle and status consistency', () => {
  assert.equal(validateProfessionalProfilePersistenceRecord(professionalRecord).valid, true);
  assert.equal(validateBusinessProfilePersistenceRecord(businessRecord).valid, true);
  assert.equal(validateProfessionalProfilePersistenceRecord({ ...professionalRecord, professionType: 'seller', professionalStatus: ProfessionalStatus.PENDING }).valid, false);
  assert.equal(validateBusinessProfilePersistenceRecord({ ...businessRecord, businessType: 'marketplace', visibility: 'promoted', lifecycleStatus: BusinessStatus.SUSPENDED }).valid, false);
  assert.equal(validateProfessionalPersistenceLifecycleTransition(ProfessionalStatus.CREATED, ProfessionalStatus.PENDING).valid, true);
  assert.equal(validateProfessionalPersistenceLifecycleTransition(ProfessionalStatus.ARCHIVED, ProfessionalStatus.ACTIVE).valid, false);
  assert.equal(validateBusinessPersistenceLifecycleTransition(BusinessStatus.ACTIVE, BusinessStatus.SUSPENDED).valid, true);
  assert.equal(validateBusinessPersistenceLifecycleTransition(BusinessStatus.ARCHIVED, BusinessStatus.ACTIVE).valid, false);
});

test('repositories are persistence abstractions with safe core error integration', () => {
  const professional = createProfessionalProfileRepository({ databaseClient: {} });
  const business = createBusinessProfileRepository({ databaseClient: {} });
  for (const repository of [professional, business]) {
    assert.equal(repository.hasDatabaseClient, true);
    assert.equal(repository.exposesApiLogic, false);
    assert.equal(repository.implementsAuthentication, false);
    assert.equal(repository.implementsAuthorization, false);
    assert.equal(repository.implementsBusinessWorkflow, false);
    assert.ok(repository.createProfileReferenceError('missing') instanceof KhedmahCoreError);
    assert.equal(repository.createProfileReferenceError('missing').code, ProfileErrorCode.PROFILE_REFERENCE_INVALID);
    assert.equal(repository.createDatabaseValidationError().code, DatabaseErrorCode.DATABASE_VALIDATION_ERROR);
    assert.equal(repository.createDatabaseValidationError().metadata.internalDetailsExposed, false);
  }
  assert.equal(professional.createDuplicateError('profile_001').code, ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE);
  assert.equal(business.createDuplicateError('profile_002').code, BusinessProfileErrorCode.BUSINESS_PROFILE_DUPLICATE);
});

test('rollbacks remove only their specialized profile objects', async () => {
  const professional = await read('backend/migrations/versions/003_create_professional_profiles_rollback.sql');
  const business = await read('backend/migrations/versions/004_create_business_profiles_rollback.sql');
  assert.match(professional, /DROP TABLE IF EXISTS professional_profiles/);
  assert.doesNotMatch(professional, /DROP TABLE IF EXISTS (business_profiles|profiles|core_user_accounts|organizations|services|locations)/i);
  assert.match(business, /DROP TABLE IF EXISTS business_profiles/);
  assert.doesNotMatch(business, /DROP TABLE IF EXISTS (professional_profiles|profiles|core_user_accounts|organizations|services|locations)/i);
});

test('security and KILL CRITICAL exclusions prevent sensitive and commerce storage', async () => {
  assert.equal(ProfessionalProfileTable.storesCertificates, false);
  assert.equal(ProfessionalProfileTable.storesLicenses, false);
  assert.equal(ProfessionalProfileTable.storesDocuments, false);
  assert.equal(ProfessionalProfileTable.storesVerificationEvidence, false);
  assert.equal(ProfessionalProfileTable.storesPasswords, false);
  assert.equal(ProfessionalProfileTable.storesTokens, false);
  assert.equal(BusinessProfileTable.storesProducts, false);
  assert.equal(BusinessProfileTable.storesInventory, false);
  assert.equal(BusinessProfileTable.storesOrders, false);
  assert.equal(BusinessProfileTable.storesPayments, false);
  assert.equal(BusinessProfileTable.storesFinancialData, false);
  assert.equal(BusinessProfileTable.storesPasswords, false);
  assert.equal(BusinessProfileTable.storesTokens, false);
  const sql = `${await read('backend/migrations/versions/003_create_professional_profiles.sql')}\n${await read('backend/migrations/versions/004_create_business_profiles.sql')}`;
  assert.doesNotMatch(sql, /CREATE TABLE (organizations|services|locations|trust|marketplace|products|inventory|orders|payments|commissions|advertising|rankings|social_profiles|tracking)/i);
});
