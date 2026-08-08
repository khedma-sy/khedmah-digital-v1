import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabasePool } from '../database/database.pool';
import { createTestPool } from '../database/test-pool';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';

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
    CREATE TABLE IF NOT EXISTS professional_directory_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES user_accounts(id),
      headline_ar TEXT NOT NULL, headline_en TEXT,
      bio_ar TEXT, bio_en TEXT,
      availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','busy','unavailable')),
      city_code TEXT NOT NULL, country_code TEXT NOT NULL,
      skills TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS service_listings (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('business','professional')),
      owner_id TEXT NOT NULL,
      title_ar TEXT NOT NULL, title_en TEXT,
      description_ar TEXT, description_en TEXT,
      category_code TEXT NOT NULL,
      price NUMERIC, price_currency TEXT DEFAULT 'SYP',
      price_type TEXT NOT NULL DEFAULT 'negotiable' CHECK (price_type IN ('fixed','hourly','negotiable')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('TRUNCATE service_listings, professional_directory_profiles, business_profiles, audit_logs, user_sessions, user_profiles, user_accounts CASCADE');

  const identityRepository = new IdentityRepository(pool);
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const businessRepo = new BusinessProfileRepository(pool);
  const professionalRepo = new ProfessionalProfileRepository(pool);
  const serviceRepo = new ServiceCatalogRepository(pool);
  const service = new ServiceCatalogService(serviceRepo, identity, businessRepo, professionalRepo);

  const ownerReg = await identity.register({ email: 'owner-svc@example.com', password: 'securepass123', displayName: 'مالك' });
  const cookie = `khedmah_session=${ownerReg.sessionToken}`;

  return { pool, service, serviceRepo, businessRepo, professionalRepo, identity, cookie, ownerId: ownerReg.user.id };
}

test('service owned by non-public business is not returned in public search', async () => {
  const { service, businessRepo, cookie, ownerId } = await createFixture();

  const now = new Date().toISOString();
  const privateBusinessId = 'bp-private-' + Date.now();

  await businessRepo.save({
    id: privateBusinessId,
    name: 'عمل خاص',
    ownerUserId: ownerId,
    visibility: 'private',
    trustStatus: 'pending',
    status: 'active',
    categoryCode: 'test',
    cityCode: 'damascus',
    countryCode: 'SY',
    isFeatured: false,
    createdAt: now,
    updatedAt: now
  });

  await service.create(cookie, {
    titleAr: 'خدمة لعمل خاص',
    categoryCode: 'test',
    priceType: 'negotiable',
    ownerId: privateBusinessId,
    ownerType: 'business',
    ownerUserId: ownerId
  });

  const result = await service.search({ q: 'خدمة', categoryCode: undefined, page: undefined });
  const titles = result.services.map((s) => s.titleAr);
  assert.equal(titles.includes('خدمة لعمل خاص'), false, 'Service from private business must not appear in public search');
});

test('service owned by approved public business is returned in public search', async () => {
  const { service, businessRepo, cookie, ownerId } = await createFixture();

  const now = new Date().toISOString();
  const publicBusinessId = 'bp-public-' + Date.now();

  await businessRepo.save({
    id: publicBusinessId,
    name: 'عمل عام',
    ownerUserId: ownerId,
    visibility: 'public',
    trustStatus: 'approved',
    status: 'active',
    categoryCode: 'test',
    cityCode: 'damascus',
    countryCode: 'SY',
    isFeatured: false,
    createdAt: now,
    updatedAt: now
  });

  await service.create(cookie, {
    titleAr: 'خدمة لعمل معتمد',
    categoryCode: 'test',
    priceType: 'negotiable',
    ownerId: publicBusinessId,
    ownerType: 'business',
    ownerUserId: ownerId
  });

  const result = await service.search({ q: 'خدمة', categoryCode: undefined, page: undefined });
  const titles = result.services.map((s) => s.titleAr);
  assert.ok(titles.includes('خدمة لعمل معتمد'), 'Service from approved public business must appear in public search');
});

test('public service projection does not include owner user identifier', async () => {
  const { service, businessRepo, cookie, ownerId } = await createFixture();

  const now = new Date().toISOString();
  const publicBusinessId = 'bp-pub2-' + Date.now();

  await businessRepo.save({
    id: publicBusinessId,
    name: 'عمل للفحص',
    ownerUserId: ownerId,
    visibility: 'public',
    trustStatus: 'approved',
    status: 'active',
    categoryCode: 'test',
    cityCode: 'damascus',
    countryCode: 'SY',
    isFeatured: false,
    createdAt: now,
    updatedAt: now
  });

  await service.create(cookie, {
    titleAr: 'خدمة فحص المعرّف',
    categoryCode: 'test',
    priceType: 'negotiable',
    ownerId: publicBusinessId,
    ownerType: 'business',
    ownerUserId: ownerId
  });

  const result = await service.search({ q: 'فحص', categoryCode: undefined, page: undefined });
  assert.ok(result.services.length > 0);
  for (const svc of result.services) {
    assert.equal('ownerUserId' in svc, false, 'ownerUserId must not appear in public service projection');
  }
});
