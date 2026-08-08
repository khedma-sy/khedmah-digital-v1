import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool } from '../database/test-pool';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';

const rawPool = createTestPool();

async function createFixture() {
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
      latitude NUMERIC, longitude NUMERIC, address_ar TEXT,
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
  await pool.query('TRUNCATE business_profiles, audit_logs, user_sessions, user_profiles, user_accounts CASCADE');

  const identityRepository = new IdentityRepository(pool);
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const businessRepo = new BusinessProfileRepository(pool);
  const rbac = new OperationsRbacService();

  const service = new BusinessProfileService(businessRepo, identity, rbac);

  const ownerReg = await identity.register({ email: 'owner@example.com', password: 'securepass123', displayName: 'مالك' });
  const ownerCookie = `khedmah_session=${ownerReg.sessionToken}`;

  const moderatorReg = await identity.register({ email: 'moderator@example.com', password: 'securepass123', displayName: 'مشرف' });
  const moderatorCookie = `khedmah_session=${moderatorReg.sessionToken}`;

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
    const { service, ownerCookie, moderatorCookie, businessId, businessRepo } = await createFixture();

    await service.updateTrustStatus(moderatorCookie, businessId, { trustStatus: 'approved' });
    await businessRepo.updateTrustStatus(businessId, 'approved', new Date().toISOString());

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
