import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { assertUniqueBusinessProfileOwnership, BusinessProfileTable, createBusinessProfileRepository, validateBusinessBaseProfileType, validateBusinessPersistenceLifecycleTransition, validateBusinessProfilePersistenceRecord } from '../backend/modules/business_profiles/repositories/business-profile-repository.mjs';
import { BusinessProfileErrorCode } from '../backend/modules/business_profiles/domain/errors.mjs';
import { BusinessStatus, BusinessType, BusinessVisibility } from '../backend/modules/business_profiles/domain/business-types.mjs';
import { assertUniqueProfessionalProfileIdentity, createProfessionalProfileRepository, ProfessionalProfileTable, validateProfessionalProfilePersistenceLifecycleTransition, validateProfessionalProfilePersistenceRecord } from '../backend/modules/professional_profiles/repositories/professional-profile-repository.mjs';
import { ProfessionalProfileErrorCode } from '../backend/modules/professional_profiles/domain/errors.mjs';
import { ProfessionType, ProfessionalStatus, ProfessionalVisibility } from '../backend/modules/professional_profiles/domain/professional-types.mjs';
import { ProfileType } from '../backend/modules/profiles/domain/profile-types.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const professionalRecord = Object.freeze({ professionalProfileIdentifier: 'professional_profile_a1234567', profileIdentifier: 'profile_a1234567', userIdentifier: 'user001', professionType: ProfessionType.ENGINEER, lifecycleStatus: ProfessionalStatus.ACTIVE, visibility: ProfessionalVisibility.PUBLIC });
const businessRecord = Object.freeze({ businessProfileIdentifier: 'business_001', profileIdentifier: 'profile_002', businessType: BusinessType.SERVICE_BUSINESS, businessStatus: BusinessStatus.ACTIVE, visibility: BusinessVisibility.PUBLIC, lifecycleStatus: BusinessStatus.ACTIVE });

test('Mission 069 creates migration 003 with a dedicated rollback', async () => {
  const files = await readdir(new URL('../backend/migrations/versions/', import.meta.url));
  for (const file of ['003_create_professional_profiles.sql', '003_create_professional_profiles_rollback.sql']) assert.ok(files.includes(file));
});

test('professional profile schema contains only approved fields and constraints', async () => {
  const sql = await read('backend/migrations/versions/003_create_professional_profiles.sql');
  assert.match(sql, /CREATE TABLE professional_profiles/);
  for (const field of ['professional_profile_identifier', 'profile_identifier', 'user_identifier', 'profession_type', 'visibility', 'lifecycle_status', 'created_at', 'updated_at']) assert.match(sql, new RegExp(field));
  const approvedTypes = ['doctor', 'dentist', 'engineer', 'lawyer', 'consultant', 'freelancer', 'technical_specialist'];
  for (const type of approvedTypes) assert.match(sql, new RegExp(`'${type}'`));
  assert.doesNotMatch(sql.split('CREATE TABLE professional_profiles')[1], /certificate|license|verification_evidence|service_identifier/i);
});

test('professional profile requires unique base profile and owner reference', async () => {
  const professionalSql = await read('backend/migrations/versions/003_create_professional_profiles.sql');
  assert.match(professionalSql, /profile_identifier TEXT NOT NULL UNIQUE/);
  assert.match(professionalSql, /REFERENCES profiles\(profile_identifier, user_identifier\)/);
  assert.equal(assertUniqueProfessionalProfileIdentity([professionalRecord, professionalRecord]).valid, false);
  assert.equal(assertUniqueBusinessProfileOwnership([businessRecord, businessRecord]).valid, false);
});

test('base profile type validation prevents invalid business profile conversion', () => {
  assert.equal(validateBusinessBaseProfileType(ProfileType.BUSINESS).valid, true);
  assert.equal(validateBusinessBaseProfileType(ProfileType.PERSONAL).valid, false);
  assert.equal(validateBusinessBaseProfileType(ProfileType.PERSONAL).errors[0].code, BusinessProfileErrorCode.PROFILE_REFERENCE_INVALID);
});

test('persistence validation checks types statuses visibility and lifecycle', () => {
  assert.equal(validateProfessionalProfilePersistenceRecord(professionalRecord).valid, true);
  assert.equal(validateBusinessProfilePersistenceRecord(businessRecord).valid, true);
  assert.equal(validateProfessionalProfilePersistenceRecord({ ...professionalRecord, professionType: 'seller' }).valid, false);
  assert.equal(validateBusinessProfilePersistenceRecord({ ...businessRecord, businessType: 'marketplace', visibility: 'promoted', lifecycleStatus: BusinessStatus.SUSPENDED }).valid, false);
  assert.equal(validateProfessionalProfilePersistenceLifecycleTransition(ProfessionalStatus.CREATED, ProfessionalStatus.PENDING).valid, true);
  assert.equal(validateProfessionalProfilePersistenceLifecycleTransition(ProfessionalStatus.ARCHIVED, ProfessionalStatus.ACTIVE).valid, false);
  assert.equal(validateBusinessPersistenceLifecycleTransition(BusinessStatus.ACTIVE, BusinessStatus.SUSPENDED).valid, true);
  assert.equal(validateBusinessPersistenceLifecycleTransition(BusinessStatus.ARCHIVED, BusinessStatus.ACTIVE).valid, false);
});

test('repositories are persistence abstractions with safe core error integration', () => {
  const professional = createProfessionalProfileRepository({ databaseClient: {} });
  const business = createBusinessProfileRepository({ databaseClient: {} });
  assert.equal(professional.hasDatabaseClient, true);
  assert.equal(professional.exposesApiLogic, false);
  assert.equal(professional.implementsAuthentication, false);
  assert.equal(professional.implementsBusinessWorkflow, false);
  assert.ok(professional.createProfileReferenceError() instanceof KhedmahCoreError);
  assert.equal(professional.createProfileReferenceError().code, ProfessionalProfileErrorCode.PROFILE_REFERENCE_INVALID);
  assert.equal(professional.createDuplicateError().code, ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE);
  assert.equal(business.hasDatabaseClient, true);
  assert.equal(business.exposesApiLogic, false);
  assert.equal(business.implementsAuthentication, false);
  assert.equal(business.implementsAuthorization, false);
  assert.equal(business.implementsBusinessWorkflow, false);
  assert.ok(business.createProfileReferenceError('missing') instanceof KhedmahCoreError);
  assert.equal(business.createDuplicateError('profile_002').code, BusinessProfileErrorCode.BUSINESS_PROFILE_DUPLICATE);
});

test('professional profile rollback removes only its own objects', async () => {
  const professional = await read('backend/migrations/versions/003_create_professional_profiles_rollback.sql');
  assert.match(professional, /DROP TABLE IF EXISTS professional_profiles/);
  assert.doesNotMatch(professional, /DROP TABLE IF EXISTS (business_profiles|profiles|core_user_accounts|organizations|services|locations)/i);
});

test('security and KILL CRITICAL exclusions prevent sensitive storage in professional profiles', async () => {
  assert.equal(ProfessionalProfileTable.storesCertificates, false);
  assert.equal(ProfessionalProfileTable.storesPrivateDocuments, false);
  assert.equal(ProfessionalProfileTable.implementsVerification, false);
  assert.equal(ProfessionalProfileTable.storesPasswords, false);
  assert.equal(ProfessionalProfileTable.storesTokens, false);
  assert.equal(BusinessProfileTable.storesProducts, false);
  assert.equal(BusinessProfileTable.storesInventory, false);
  assert.equal(BusinessProfileTable.storesOrders, false);
  assert.equal(BusinessProfileTable.storesPayments, false);
  assert.equal(BusinessProfileTable.storesFinancialData, false);
  assert.equal(BusinessProfileTable.storesPasswords, false);
  assert.equal(BusinessProfileTable.storesTokens, false);
  const sql = await read('backend/migrations/versions/003_create_professional_profiles.sql');
  assert.doesNotMatch(sql, /CREATE TABLE (organizations|services|locations|trust|marketplace|products|inventory|orders|payments|commissions|advertising|rankings|social_profiles|tracking)/i);
});
