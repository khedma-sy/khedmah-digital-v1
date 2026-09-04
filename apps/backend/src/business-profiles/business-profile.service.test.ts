import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { CategoryRepository } from '../categories/category.repository';
import { CategoryService } from '../categories/category.service';

const rawPool = createTestPool();

async function createFixture() {
  await resetCanonicalTestSchema(rawPool);
  const pool = DatabasePool.fromPool(rawPool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'ar',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
      actor_user_id TEXT, request_id TEXT, correlation_id TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES user_accounts(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS business_profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description_ar TEXT, description_en TEXT,
      owner_user_id TEXT NOT NULL REFERENCES user_accounts(id),
      organization_id TEXT REFERENCES organizations(id),
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
      trust_status TEXT NOT NULL DEFAULT 'pending' CHECK (trust_status IN ('pending','approved','suspended')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
      phone TEXT, email TEXT, website TEXT,
      category_code TEXT NOT NULL, city_code TEXT NOT NULL, country_code TEXT NOT NULL,
      lat NUMERIC, lng NUMERIC, address_ar TEXT,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE, featured_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS trust_history (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT REFERENCES user_accounts(id),
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS trust_history_entity_idx ON trust_history(entity_type, entity_id);
  `);
  await pool.query('TRUNCATE business_profiles, audit_logs, identity_sessions, identity_credentials, profiles, core_user_accounts, user_sessions, user_profiles, user_accounts CASCADE');

  const identityRepository = new IdentityRepository(pool);
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const businessRepo = new BusinessProfileRepository(pool);
  const rbac = new OperationsRbacService();
  await pool.query(`INSERT INTO categories (code, name_ar) VALUES ('restaurant', 'مطاعم') ON CONFLICT (code) DO NOTHING`);
  const categories = new CategoryService(new CategoryRepository(pool));

  const service = new BusinessProfileService(businessRepo, identity, rbac, categories);

  const ownerReg = await identity.register({ email: 'owner@example.com', password: 'securepass123', displayName: 'مالك' });
  await pool.query(`UPDATE core_user_accounts SET account_status = 'active', lifecycle_status = 'active' WHERE user_identifier = $1`, [ownerReg.user.id]);
  const ownerLogin = await identity.login({ email: 'owner@example.com', password: 'securepass123' });
  const ownerCookie = `khedmah_session=${ownerLogin.sessionToken}`;

  const moderatorReg = await identity.register({ email: 'moderator@example.com', password: 'securepass123', displayName: 'مشرف' });
  await pool.query(`UPDATE core_user_accounts SET account_status = 'active', lifecycle_status = 'active' WHERE user_identifier = $1`, [moderatorReg.user.id]);
  const moderatorLogin = await identity.login({ email: 'moderator@example.com', password: 'securepass123' });
  const moderatorCookie = `khedmah_session=${moderatorLogin.sessionToken}`;

  const created = await service.create(ownerCookie, {
    name: 'عمل للاختبار',
    categoryCode: 'restaurant',
    cityCode: 'damascus',
    countryCode: 'SY'
  });

  return { pool, service, businessRepo, ownerCookie, moderatorCookie, businessId: created.id };
}

test('ordinary authenticated user cannot update trust status', async () => {
  const { service, ownerCookie, businessId } = await createFixture();

  await assert.rejects(
    () => service.updateTrustStatus(ownerCookie, businessId, { trustStatus: 'approved' }),
    ForbiddenException
  );
});

test('user without operations binding cannot update trust status', async () => {
  const { service, moderatorCookie, businessId } = await createFixture();

  await assert.rejects(
    () => service.updateTrustStatus(moderatorCookie, businessId, { trustStatus: 'approved' }),
    ForbiddenException
  );
});

test('user with security.manage permission can update trust status', async () => {
  const originalEnv = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'moderator@example.com': ['security_operations_engineer'] });

  try {
    const { service, moderatorCookie, businessId } = await createFixture();
    const result = await service.updateTrustStatus(moderatorCookie, businessId, { trustStatus: 'approved' });
    assert.equal(result.trustStatus, 'approved');
  } finally {
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = originalEnv;
  }
});

test('public business profile does not expose ownerUserId', async () => {
  const originalEnv = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'moderator@example.com': ['security_operations_engineer'] });

  try {
    const { pool, service, ownerCookie, moderatorCookie, businessId, businessRepo } = await createFixture();

    await service.updateTrustStatus(moderatorCookie, businessId, { trustStatus: 'approved' });
    await businessRepo.updateTrustStatus(businessId, 'approved', new Date().toISOString());
    await pool.query('UPDATE business_profiles SET moderation_status = $2 WHERE id = $1', [businessId, 'approved']);

    await service.update(ownerCookie, businessId, { visibility: 'public' });

    const publicProfile = await service.getPublic(businessId);
    assert.equal('ownerUserId' in publicProfile, false, 'ownerUserId must not appear in public projection');
  } finally {
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = originalEnv;
  }
});

test('listMine does not expose ownerUserId in owner projection', async () => {
  const { service, ownerCookie } = await createFixture();
  const businesses = await service.listMine(ownerCookie);
  assert.ok(businesses.length > 0);
  for (const business of businesses) {
    assert.equal('ownerUserId' in business, false, 'ownerUserId must not appear in owner list');
  }
});

test('only the business owner can delete one of its branches', async () => {
  const { service, ownerCookie, moderatorCookie, businessId } = await createFixture();
  const branch = await service.addBranch(ownerCookie, businessId, {
    nameAr: 'فرع الاختبار',
    cityCode: 'damascus',
    isMain: false
  });

  await assert.rejects(
    () => service.deleteBranch(moderatorCookie, businessId, branch.id),
    ForbiddenException
  );
  assert.equal((await service.getBranches(ownerCookie, businessId)).some((item) => item.id === branch.id), true);

  await service.deleteBranch(ownerCookie, businessId, branch.id);
  assert.equal((await service.getBranches(ownerCookie, businessId)).some((item) => item.id === branch.id), false);
});

test('unchanged inactive legacy category does not block unrelated profile edits', async () => {
  const { pool, service, ownerCookie, businessId } = await createFixture();
  await pool.query(`
    INSERT INTO categories (code, name_ar, status) VALUES
      ('legacy_business', 'تصنيف نشاط قديم', 'inactive'),
      ('legacy_other', 'تصنيف قديم آخر', 'inactive')
    ON CONFLICT (code) DO UPDATE SET status = 'inactive', parent_code = NULL
  `);
  await pool.query('UPDATE business_profiles SET category_code = $2 WHERE id = $1', [businessId, 'legacy_business']);

  const updated = await service.update(ownerCookie, businessId, {
    descriptionAr: 'تعديل لا يغير التصنيف القديم',
    categoryCode: 'legacy_business'
  });
  assert.equal(updated.categoryCode, 'legacy_business');
  assert.equal(updated.categoryNameAr, 'تصنيف نشاط قديم');
  assert.equal(updated.descriptionAr, 'تعديل لا يغير التصنيف القديم');
  await pool.query(
    `UPDATE business_profiles
     SET visibility = 'public', moderation_status = 'approved', trust_status = 'approved'
     WHERE id = $1`,
    [businessId]
  );
  const publicProfile = await service.getPublic(businessId);
  assert.equal(publicProfile.categoryNameAr, 'تصنيف نشاط قديم');
  await assert.rejects(
    () => service.update(ownerCookie, businessId, { categoryCode: 'legacy_other' }),
    BadRequestException
  );
  const reclassified = await service.update(ownerCookie, businessId, { categoryCode: 'restaurant' });
  assert.equal(reclassified.categoryCode, 'restaurant');
  assert.equal(reclassified.categoryNameAr, 'مطاعم');
});

test('admin approval atomically publishes a business and records the decision', async () => {
  const originalEnv = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'moderator@example.com': ['security_operations_engineer'] });

  try {
    const { pool, service, businessRepo, ownerCookie, moderatorCookie, businessId } = await createFixture();
    await service.requestVerification(ownerCookie, 'business', businessId);

    const approved = await service.approveAndPublish(moderatorCookie, businessId);
    assert.equal(approved.visibility, 'public');
    assert.equal(approved.moderationStatus, 'approved');
    assert.equal(approved.trustStatus, 'approved');
    assert.equal((await service.getPublic(businessId)).id, businessId);

    const [stored] = await pool.query<{ visibility: string; moderation_status: string; trust_status: string }>(
      'SELECT visibility, moderation_status, trust_status FROM business_profiles WHERE id = $1',
      [businessId]
    );
    assert.deepEqual(stored, { visibility: 'public', moderation_status: 'approved', trust_status: 'approved' });

    const verification = await businessRepo.findVerificationRequest('business', businessId);
    assert.equal(verification?.status, 'approved');
    assert.ok(verification?.reviewedBy);
    assert.ok(verification?.reviewedAt);

    const history = await businessRepo.listTrustHistory('business', businessId);
    assert.equal(history.length, 2);
    assert.deepEqual(history.map((entry) => entry.newStatus), ['approved', 'approved']);
  } finally {
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = originalEnv;
  }
});

test('material edits return an approved business to private pending review', async () => {
  const originalEnv = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'moderator@example.com': ['security_operations_engineer'] });

  try {
    const { service, ownerCookie, moderatorCookie, businessId } = await createFixture();
    await service.approveAndPublish(moderatorCookie, businessId);

    const updated = await service.update(ownerCookie, businessId, { name: 'اسم يحتاج مراجعة جديدة' });
    assert.equal(updated.visibility, 'private');
    assert.equal(updated.moderationStatus, 'pending');
    await assert.rejects(() => service.getPublic(businessId), NotFoundException);
  } finally {
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = originalEnv;
  }
});

test('business auxiliary resources are owner-only before publication and trust history stays private', async () => {
  const originalEnv = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'moderator@example.com': ['security_operations_engineer'] });

  try {
    const { service, ownerCookie, moderatorCookie, businessId } = await createFixture();
    await service.addBranch(ownerCookie, businessId, {
      nameAr: 'الفرع الرئيسي',
      cityCode: 'damascus',
      isMain: true
    });

    await assert.rejects(() => service.getBranches(undefined, businessId), NotFoundException);
    assert.equal((await service.getBranches(ownerCookie, businessId)).length, 1);

    await service.approveAndPublish(moderatorCookie, businessId);
    assert.equal((await service.getBranches(undefined, businessId)).length, 1);
    await assert.rejects(() => service.getTrustHistory(undefined, 'business', businessId), NotFoundException);
    assert.equal((await service.getTrustHistory(ownerCookie, 'business', businessId)).length, 2);

    const verification = await service.getVerificationStatus(undefined, 'business', businessId);
    assert.equal(verification, undefined);
  } finally {
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = originalEnv;
  }
});
