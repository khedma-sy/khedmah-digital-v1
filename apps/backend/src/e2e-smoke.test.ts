/**
 * WP-07: End-to-End Smoke Suite
 *
 * Covers all mandatory smoke scenarios:
 *   - Register
 *   - Email Verification (send & resend protection)
 *   - Login (success + wrong password rejection)
 *   - Create Business Profile
 *   - Create Professional Profile
 *   - Search
 *   - Contact (inquiry on approved public business)
 *   - Admin RBAC enforcement
 *   - Logout (session revocation)
 *
 * Runs against a live PostgreSQL instance (provided in CI by test-and-verify.yml).
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { Pool } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { DatabaseMigrator } from '../database/database.migrator';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { EmailVerificationService } from '../identity/email-verification.service';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { ContactRepository } from '../contact/contact.repository';
import { ContactService } from '../contact/contact.service';
import { ContactRateLimitService } from '../contact/contact-rate-limit.service';
import { ContactAbuseService } from '../contact/contact-abuse.service';
import { PlatformLogger } from '../logging/platform-logger';

const rawPool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: parseInt(process.env.PGPORT ?? '5432', 10),
  user: process.env.PGUSER ?? 'khedmah',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? 'khedmah_dev'
});

let identityService: IdentityService;
let emailVerificationService: EmailVerificationService;
let businessProfileService: BusinessProfileService;
let professionalProfileService: ProfessionalProfileService;
let contactService: ContactService;

// Shared state across smoke steps
let sessionToken: string;
let userId: string;
let businessId: string;

before(async () => {
  const dbPool = DatabasePool.fromPool(rawPool);
  process.env.EMAIL_PROVIDER = 'none';

  const migrator = new DatabaseMigrator(dbPool);
  await migrator.onModuleInit();

  const identityRepo = new IdentityRepository(dbPool);
  identityService = new IdentityService(identityRepo, new SessionTokenService());
  emailVerificationService = new EmailVerificationService(dbPool);

  const rbac = new OperationsRbacService();
  const businessRepo = new BusinessProfileRepository(dbPool);
  businessProfileService = new BusinessProfileService(businessRepo, identityService, rbac);

  const profRepo = new ProfessionalProfileRepository(dbPool);
  professionalProfileService = new ProfessionalProfileService(profRepo, identityService);

  const contactRepo = new ContactRepository(dbPool);
  const logger = new PlatformLogger();
  contactService = new ContactService(
    contactRepo, identityService, identityRepo,
    new ContactRateLimitService(), new ContactAbuseService(), logger
  );

  // Clean up any pre-existing smoke test data.
  await rawPool.query(`
    DELETE FROM audit_logs WHERE actor_user_id IN (
      SELECT id FROM user_accounts WHERE email LIKE '%smoke-e2e@khedmah.test%'
    );
    DELETE FROM user_sessions WHERE user_id IN (
      SELECT id FROM user_accounts WHERE email LIKE '%smoke-e2e@khedmah.test%'
    );
    DELETE FROM professional_directory_profiles WHERE user_id IN (
      SELECT id FROM user_accounts WHERE email LIKE '%smoke-e2e@khedmah.test%'
    );
    DELETE FROM business_profiles WHERE owner_user_id IN (
      SELECT id FROM user_accounts WHERE email LIKE '%smoke-e2e@khedmah.test%'
    );
    DELETE FROM user_profiles WHERE user_id IN (
      SELECT id FROM user_accounts WHERE email LIKE '%smoke-e2e@khedmah.test%'
    );
    DELETE FROM user_accounts WHERE email LIKE '%smoke-e2e@khedmah.test%';
  `).catch(() => {});
});

after(async () => {
  await rawPool.end().catch(() => {});
});

test('smoke/register: creates a new user account with Arabic locale', async () => {
  const result = await identityService.register({
    email: 'user-smoke-e2e@khedmah.test',
    password: 'SmokeTestPass123!',
    displayName: 'مستخدم تجريبي'
  });

  assert.ok(result.sessionToken, 'session token must be returned on register');
  assert.equal(result.user.email, 'user-smoke-e2e@khedmah.test');
  assert.equal(result.user.profile.locale, 'ar');

  sessionToken = result.sessionToken;
  userId = result.user.id;
});

test('smoke/email-verification: sends token and enforces resend cooldown', async () => {
  assert.ok(userId, 'register must succeed before email verification');

  process.env.EMAIL_VERIFY_RESEND_COOLDOWN_MINUTES = '5';
  const first = await emailVerificationService.sendVerification(userId, 'user-smoke-e2e@khedmah.test');
  assert.equal(first.status, 'sent');

  const second = await emailVerificationService.sendVerification(userId, 'user-smoke-e2e@khedmah.test');
  assert.equal(second.status, 'resend_too_soon');
});

test('smoke/login: succeeds with correct credentials', async () => {
  const result = await identityService.login({
    email: 'user-smoke-e2e@khedmah.test',
    password: 'SmokeTestPass123!'
  });

  assert.ok(result.sessionToken, 'login must produce a session token');
  sessionToken = result.sessionToken;
});

test('smoke/login: rejects wrong password', async () => {
  await assert.rejects(
    () => identityService.login({ email: 'user-smoke-e2e@khedmah.test', password: 'WrongPassword!' }),
    /unauthorized|credentials|invalid/i
  );
});

test('smoke/create-business: creates a business profile without exposing owner ID', async () => {
  assert.ok(sessionToken, 'login must succeed before creating business');

  const cookieHeader = `session_token=${sessionToken}`;
  const profile = await businessProfileService.create(cookieHeader, {
    name: 'متجر الدخان',
    categoryCode: 'retail',
    cityCode: 'damascus',
    countryCode: 'SY'
  });

  assert.ok(profile.id, 'business profile must have an id');
  assert.equal((profile as Record<string, unknown>).ownerUserId, undefined, 'ownerUserId must not be in public projection');
  businessId = profile.id;
});

test('smoke/create-professional: creates a professional profile', async () => {
  assert.ok(sessionToken, 'login must succeed before creating professional profile');

  const cookieHeader = `session_token=${sessionToken}`;
  const profile = await professionalProfileService.createOrUpdate(cookieHeader, {
    headlineAr: 'مطور برمجيات',
    cityCode: 'damascus',
    countryCode: 'SY',
    skills: ['TypeScript', 'Node.js']
  });

  assert.ok(profile.id, 'professional profile must have an id');
});

test('smoke/search: search completes without error', async () => {
  const result = await businessProfileService.search({ cityCode: 'damascus', page: 1, pageSize: 10 });
  assert.ok(Array.isArray(result.businesses), 'search must return a businesses array');
});

test('smoke/contact: inquiry on approved public business succeeds', async () => {
  assert.ok(businessId, 'business profile must be created before contact test');
  assert.ok(sessionToken, 'login must succeed before contact test');

  // Promote business to approved+public for smoke test.
  await rawPool.query(
    `UPDATE business_profiles SET trust_status = 'approved', visibility = 'public' WHERE id = $1`,
    [businessId]
  );

  const cookieHeader = `session_token=${sessionToken}`;
  const receipt = await contactService.submitInquiry(cookieHeader, businessId, {
    name: 'مرسل الاستفسار',
    contactEmail: 'smoke@khedmah.test',
    message: 'استفسار تجريبي للتحقق من النظام بالكامل'
  });

  assert.ok(receipt.id, 'inquiry receipt must have an id');
});

test('smoke/admin: RBAC denies access without role binding', () => {
  const rbac = new OperationsRbacService();
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;

  assert.throws(
    () => rbac.assert('noadmin@khedmah.test', 'security.manage'),
    /denied/i
  );
});

test('smoke/logout: revokes the active session', async () => {
  assert.ok(sessionToken, 'must have a session token before logout');

  await identityService.logout(sessionToken);

  await assert.rejects(
    () => identityService.getCurrentUser(sessionToken),
    /unauthorized/i
  );
});
