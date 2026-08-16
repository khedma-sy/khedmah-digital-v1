/**
 * EO-011 End-to-End Smoke Test Suite
 *
 * Tests the full production-critical user journey:
 * Register → Email Verification Request → Login → Create Business → Search → Logout
 *
 * Also covers: Bootstrap Admin, Rate Limiting guard, Trust lifecycle.
 *
 * Requires a live PostgreSQL database (uses PGHOST/PGPORT/etc env vars).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabasePool } from '../database/database.pool';
import { RateLimitRepository } from '../database/rate-limit.repository';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { CategoryRepository } from '../categories/category.repository';
import { CategoryService } from '../categories/category.service';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { EmailVerificationService } from '../identity/email/email-verification.service';
import { BootstrapAdminService } from '../identity/bootstrap/bootstrap-admin.service';
import { RateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { SearchService } from '../search/search.service';
import { ServiceCatalogRepository } from '../service-catalog/service-catalog.repository';

const rawPool = createTestPool();

const INLINE_DDL = `
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
  CREATE TABLE IF NOT EXISTS admin_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, role)
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS business_profiles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    description_ar TEXT, description_en TEXT,
    owner_user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    organization_id TEXT REFERENCES organizations(id),
    visibility TEXT NOT NULL DEFAULT 'private',
    trust_status TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'active',
    phone TEXT, email TEXT, website TEXT,
    category_code TEXT NOT NULL DEFAULT 'general',
    city_code TEXT NOT NULL DEFAULT 'damascus',
    country_code TEXT NOT NULL DEFAULT 'SY',
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, address_ar TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    featured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS trust_history (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    old_status TEXT NOT NULL, new_status TEXT NOT NULL,
    changed_by TEXT, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS verification_requests (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    requester_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS business_media_assets (
    id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL, asset_type TEXT NOT NULL,
    url TEXT NOT NULL, storage_path TEXT, mime_type TEXT, size_bytes INTEGER, sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS business_opening_hours (
    id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL, open_time TEXT, close_time TEXT, is_closed BOOLEAN NOT NULL DEFAULT FALSE
  );
  CREATE TABLE IF NOT EXISTS business_branches (
    id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL,
    name_ar TEXT NOT NULL, name_en TEXT, address_ar TEXT, phone TEXT,
    city_code TEXT NOT NULL, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    is_main BOOLEAN NOT NULL DEFAULT FALSE
  );
  CREATE TABLE IF NOT EXISTS business_social_links (
    id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL,
    platform TEXT NOT NULL, url TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY, business_profile_id TEXT, professional_profile_id TEXT,
    name TEXT NOT NULL, description_ar TEXT, description_en TEXT, category_code TEXT NOT NULL,
    price_amount DECIMAL, price_currency TEXT, price_unit TEXT,
    status TEXT NOT NULL DEFAULT 'active', city_code TEXT, country_code TEXT NOT NULL DEFAULT 'SY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS professional_directory_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES user_accounts(id),
    headline_ar TEXT NOT NULL,
    headline_en TEXT,
    bio_ar TEXT,
    bio_en TEXT,
    availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','busy','unavailable')),
    city_code TEXT NOT NULL,
    country_code TEXT NOT NULL,
    skills TEXT[] NOT NULL DEFAULT '{}',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    featured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS service_listings (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('business','professional')),
    owner_id TEXT NOT NULL,
    title_ar TEXT NOT NULL,
    title_en TEXT,
    description_ar TEXT,
    description_en TEXT,
    category_code TEXT NOT NULL,
    price NUMERIC,
    price_currency TEXT DEFAULT 'SYP',
    price_type TEXT NOT NULL DEFAULT 'negotiable' CHECK (price_type IN ('fixed','hourly','negotiable')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    featured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function setupFixture() {
  await resetCanonicalTestSchema(rawPool);
  const pool = DatabasePool.fromPool(rawPool);
  await pool.query(INLINE_DDL);
  await pool.query(`
    TRUNCATE trust_history, verification_requests, business_social_links, business_branches,
    business_opening_hours, business_media_assets, business_profiles, service_listings, email_verifications,
    admin_roles, audit_logs, identity_sessions, identity_credentials, profiles, core_user_accounts,
    user_sessions, user_profiles, user_accounts CASCADE
  `);
  const identityRepo = new IdentityRepository(pool);
  const sessionTokens = new SessionTokenService();
  const identityService = new IdentityService(identityRepo, sessionTokens);
  const businessRepo = new BusinessProfileRepository(pool);
  const rbac = new OperationsRbacService();
  await pool.query(`INSERT INTO categories (code, name_ar) VALUES ('restaurant', 'مطاعم') ON CONFLICT (code) DO NOTHING`);
  const categories = new CategoryService(new CategoryRepository(pool));
  const businessService = new BusinessProfileService(businessRepo, identityService, rbac, categories);
  const serviceCatalogRepo = new ServiceCatalogRepository(pool);
  const searchService = new SearchService(businessRepo, serviceCatalogRepo);
  const emailVerificationService = new EmailVerificationService(pool, identityRepo);
  const bootstrapAdminService = new BootstrapAdminService(identityRepo, sessionTokens);

  return { pool, identityRepo, identityService, businessService, searchService, emailVerificationService, bootstrapAdminService };
}

// WP-01: Bootstrap Admin

test('bootstrap admin: fails when BOOTSTRAP_ADMIN_SECRET is not set', async () => {
  const { bootstrapAdminService } = await setupFixture();
  delete process.env.BOOTSTRAP_ADMIN_SECRET;
  await assert.rejects(
    () => bootstrapAdminService.bootstrap('any-secret', { email: 'admin@example.com', password: 'admin-password-secure', displayName: 'Admin' }),
    { message: 'Bootstrap is not available.' }
  );
});

test('bootstrap admin: fails with wrong secret', async () => {
  const { bootstrapAdminService } = await setupFixture();
  process.env.BOOTSTRAP_ADMIN_SECRET = 'a'.repeat(32);
  await assert.rejects(
    () => bootstrapAdminService.bootstrap('wrong-secret', { email: 'admin@example.com', password: 'admin-password-secure', displayName: 'Admin' }),
    { message: 'Bootstrap secret invalid.' }
  );
  delete process.env.BOOTSTRAP_ADMIN_SECRET;
});

test('bootstrap admin: creates admin on first call, rejects on second call', async () => {
  const { bootstrapAdminService, identityRepo } = await setupFixture();
  const secret = 'x'.repeat(32);
  process.env.BOOTSTRAP_ADMIN_SECRET = secret;

  const result = await bootstrapAdminService.bootstrap(secret, {
    email: 'admin@khedmah.example',
    password: 'admin-secure-password-123',
    displayName: 'مدير النظام'
  });
  assert.ok(result.userId);
  assert.equal(result.email, 'admin@khedmah.example');

  const roles = await identityRepo.findAdminRoles(result.userId);
  assert.ok(roles.includes('bootstrap_admin'));

  const logs = await identityRepo.listAuditLogs();
  assert.ok(logs.some((l) => l.eventType === 'admin.bootstrap'));

  await assert.rejects(
    () => bootstrapAdminService.bootstrap(secret, {
      email: 'admin2@khedmah.example',
      password: 'admin-secure-password-456',
      displayName: 'مدير ثاني'
    }),
    { message: /Bootstrap has already been completed/ }
  );

  delete process.env.BOOTSTRAP_ADMIN_SECRET;
});

// WP-03: Rate Limiting

test('rate limiting: blocks after configured max requests across middleware instances', async () => {
  await resetCanonicalTestSchema(rawPool);
  const repository = new RateLimitRepository(DatabasePool.fromPool(rawPool));

  const limiterA = new RateLimitMiddleware(repository, 'test.register.shared', 60000, 3);
  const limiterB = new RateLimitMiddleware(repository, 'test.register.shared', 60000, 3);

  const req = {
    headers: { 'x-forwarded-for': '10.0.0.1' },
    socket: { remoteAddress: '10.0.0.1' }
  } as any;

  const res = {} as any;
  const next = () => {};

  await limiterA.use(req, res, next);
  await limiterB.use(req, res, next);
  await limiterA.use(req, res, next);

  await assert.rejects(
    () => limiterB.use(req, res, next),
    { message: 'Rate limit exceeded. Please try again later.' }
  );
});

test('rate limiting: different IPs have independent persistent limits', async () => {
  await resetCanonicalTestSchema(rawPool);
  const repository = new RateLimitRepository(DatabasePool.fromPool(rawPool));
  const limiter = new RateLimitMiddleware(repository, 'test.search.shared', 60000, 2);

  const next = () => {};
  const makeReq = (ip: string) => ({
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip }
  } as any);

  const res = {} as any;

  await limiter.use(makeReq('1.1.1.1'), res, next);
  await limiter.use(makeReq('1.1.1.1'), res, next);
  await limiter.use(makeReq('2.2.2.2'), res, next);

  await assert.rejects(() => limiter.use(makeReq('1.1.1.1'), res, next));

  await limiter.use(makeReq('2.2.2.2'), res, next);
});

// E2E: Full user journey

test('e2e smoke: register → login → create business → search → logout', async () => {
  const { identityService, identityRepo, businessService, searchService } = await setupFixture();

  // 1. Register
  const reg = await identityService.register({
    email: 'smoke-test@khedmah.example',
    password: 'smoke-test-password-secure',
    displayName: 'مستخدم التجربة'
  });
  assert.ok(reg.sessionToken);
  assert.equal(reg.user.email, 'smoke-test@khedmah.example');

  // 2. Login with same credentials
  const login = await identityService.login({
    email: 'smoke-test@khedmah.example',
    password: 'smoke-test-password-secure'
  });
  assert.ok(login.sessionToken);

  // 3. Create business profile
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = '{}';
  const business = await businessService.create(`khedmah_session=${login.sessionToken}`, {
    name: 'مطعم التجربة',
    categoryCode: 'restaurant',
    cityCode: 'damascus',
    countryCode: 'SY'
  });
  assert.equal(business.name, 'مطعم التجربة');
  assert.equal(business.trustStatus, 'pending');
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;

  // 4. Search (business is pending/private so won't show in public search — verify it returns correctly)
  const searchResults = await searchService.search({ q: 'مطعم', page: 1 });
  assert.ok(Array.isArray(searchResults.businesses));

  // 5. Audit log check
  const auditLogs = await identityRepo.listAuditLogs();
  assert.ok(auditLogs.some((l) => l.eventType === 'auth.register'));
  assert.ok(auditLogs.some((l) => l.eventType === 'auth.login_success'));

  // 6. Logout
  await identityService.logout(reg.sessionToken);
  const sessionAfterLogout = await identityService.getSession(reg.sessionToken);
  assert.equal(sessionAfterLogout, undefined);
});

// WP-02: Email Verification

test('email verification: request and confirm token flow', async () => {
  const { identityService, identityRepo, emailVerificationService } = await setupFixture();

  const reg = await identityService.register({
    email: 'verify-me@khedmah.example',
    password: 'secure-password-verify',
    displayName: 'مستخدم التحقق'
  });

  // Override email provider to capture token
  let capturedUrl: string | undefined;
  (emailVerificationService as any).emailProvider = {
    send: async (msg: { textBody: string }) => {
      const match = msg.textBody.match(/token=([A-Za-z0-9_-]+)/);
      if (match) capturedUrl = match[1];
    }
  };

  await emailVerificationService.requestVerification(reg.user.id, reg.user.email);

  const logs = await identityRepo.listAuditLogs();
  assert.ok(logs.some((l) => l.eventType === 'email.verification.requested'));
  assert.ok(capturedUrl, 'token should have been captured');

  // Confirm the token
  const confirmed = await emailVerificationService.confirmVerification(capturedUrl!);
  assert.equal(confirmed.email, 'verify-me@khedmah.example');

  const confirmLogs = await identityRepo.listAuditLogs();
  assert.ok(confirmLogs.some((l) => l.eventType === 'email.verification.confirmed'));

  // Double confirm should fail
  await assert.rejects(
    () => emailVerificationService.confirmVerification(capturedUrl!),
    { message: 'Email has already been verified.' }
  );
});

test('email verification: expired token is rejected', async () => {
  const { identityService, emailVerificationService, pool } = await setupFixture();

  const reg = await identityService.register({
    email: 'expired@khedmah.example',
    password: 'secure-password-expired',
    displayName: 'منتهي الصلاحية'
  });

  let capturedToken: string | undefined;
  (emailVerificationService as any).emailProvider = {
    send: async (msg: { textBody: string }) => {
      const match = msg.textBody.match(/token=([A-Za-z0-9_-]+)/);
      if (match) capturedToken = match[1];
    }
  };

  await emailVerificationService.requestVerification(reg.user.id, reg.user.email);
  assert.ok(capturedToken);

  // Manually expire the token
  const { createHash } = await import('node:crypto');
  const tokenHash = createHash('sha256').update(capturedToken!).digest('base64url');
  await pool.query(
    `UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = $1`,
    [tokenHash]
  );

  await assert.rejects(
    () => emailVerificationService.confirmVerification(capturedToken!),
    { message: 'Verification token has expired. Please request a new one.' }
  );
});
