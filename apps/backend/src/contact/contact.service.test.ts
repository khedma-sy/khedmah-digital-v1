import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { RateLimitRepository } from '../database/rate-limit.repository';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactBusinessUnavailableError, ContactIdempotencyConflictError, ContactRateLimitError, ContactValidationError } from './contact.errors';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { ContactService } from './contact.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { PlatformLogger } from '../logging/platform-logger';

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
    CREATE TABLE IF NOT EXISTS business_profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description_ar TEXT, description_en TEXT,
      owner_user_id TEXT NOT NULL REFERENCES user_accounts(id),
      organization_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
      trust_status TEXT NOT NULL DEFAULT 'pending' CHECK (trust_status IN ('pending','approved','suspended')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
      phone TEXT, email TEXT, website TEXT,
      category_code TEXT NOT NULL, city_code TEXT NOT NULL, country_code TEXT NOT NULL,
      lat NUMERIC, lng NUMERIC, address_ar TEXT,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE, featured_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT,
      professional_profile_id TEXT,
      submitter_user_id TEXT NOT NULL REFERENCES user_accounts(id),
      name TEXT NOT NULL, contact_email TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted', tracking_status TEXT NOT NULL DEFAULT 'submitted',
      request_id TEXT, correlation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((business_profile_id IS NOT NULL) <> (professional_profile_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS professional_profiles (
      professional_profile_identifier TEXT PRIMARY KEY, user_identifier TEXT NOT NULL,
      visibility TEXT NOT NULL, moderation_status TEXT NOT NULL, lifecycle_status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contact_submission_idempotency (
      submitter_user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, inquiry_id TEXT NOT NULL REFERENCES contact_inquiries(id) ON DELETE CASCADE,
      payload_fingerprint CHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT contact_submission_idempotency_submitter_key_unique UNIQUE (submitter_user_id, idempotency_key),
      CONSTRAINT contact_submission_idempotency_inquiry_unique UNIQUE (inquiry_id)
    );
    CREATE TABLE IF NOT EXISTS contact_actions (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT,
      professional_profile_id TEXT,
      actor_user_id TEXT,
      action_type TEXT NOT NULL,
      request_id TEXT, correlation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('TRUNCATE contact_actions, contact_submission_idempotency, contact_inquiries, professional_profiles, business_profiles, audit_logs, identity_sessions, identity_credentials, profiles, core_user_accounts, user_sessions, user_profiles, user_accounts CASCADE');

  const identityRepository = new IdentityRepository(pool);
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const contacts = new ContactRepository(pool);
  const logger = new PlatformLogger();
  logger.log = () => undefined;
  const service = new ContactService(contacts, identity, identityRepository, new ContactRateLimitService(new RateLimitRepository(pool)), new ContactAbuseService(), logger);
  const registration = await identity.register({ email: 'user@example.com', password: 'very-secure-password', displayName: 'زائر خدمة' });
  await pool.query(`UPDATE core_user_accounts SET account_status = 'active', lifecycle_status = 'active' WHERE user_identifier = $1`, [registration.user.id]);
  const login = await identity.login({ email: 'user@example.com', password: 'very-secure-password' });
  const cookieHeader = `khedmah_session=${login.sessionToken}`;

  await pool.query(`INSERT INTO categories (code, name_ar) VALUES ('restaurant', 'مطاعم') ON CONFLICT (code) DO NOTHING`);
  await pool.query(
    `INSERT INTO user_accounts (id, email, password_hash, status, created_at, updated_at)
     VALUES ('owner-user', 'owner@biz.example', 'placeholder-hash', 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(`INSERT INTO professional_profiles
    (professional_profile_identifier, profile_identifier, user_identifier, profession_type, visibility, moderation_status, lifecycle_status)
    VALUES ('professional_profile_contact_1', $1, $2, 'freelancer', 'public', 'approved', 'active')`,
    [`profile_${registration.user.id.replaceAll('-', '')}`, registration.user.id]);
  await pool.query(
    `INSERT INTO business_profiles (id, name, owner_user_id, visibility, moderation_status, trust_status, status, category_code, city_code, country_code, created_at, updated_at)
     VALUES
       ('approved-business', 'معمل الاختبار', $1, 'public', 'approved', 'approved', 'active', 'restaurant', 'damascus', 'SY', NOW(), NOW()),
       ('private-business', 'عمل خاص', $1, 'private', 'approved', 'approved', 'active', 'restaurant', 'damascus', 'SY', NOW(), NOW()),
       ('suspended-business', 'عمل موقوف', $1, 'public', 'approved', 'suspended', 'active', 'restaurant', 'damascus', 'SY', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [registration.user.id]
  );

  return { contacts, identityRepository, service, cookieHeader, pool };
}

const validInquiry = {
  name: 'عميل مهتم',
  contactEmail: 'client@example.com',
  message: 'أرغب في معرفة تفاصيل الخدمة المتاحة لديكم.'
};

test('approved business accepts inquiry and creates an audit event', async () => {
  const { contacts, identityRepository, service, cookieHeader } = await createFixture();
  const receipt = await service.submitInquiry(cookieHeader, { type: 'business', id: 'approved-business' }, validInquiry, 'idem-approved-0001');

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.status, 'submitted');
  assert.equal((await contacts.listContactInquiries('approved-business')).length, 1);
  const logs = await identityRepository.listAuditLogs();
  assert.ok(logs.some((event) => event.eventType === 'contact.inquiry.submitted'));
});

test('non-public business rejects inquiry', async () => {
  const { service, cookieHeader } = await createFixture();

  await assert.rejects(() => service.submitInquiry(cookieHeader, { type: 'business', id: 'private-business' }, validInquiry, 'idem-private-00001'), ContactBusinessUnavailableError);
});

test('suspended business rejects inquiry', async () => {
  const { service, cookieHeader } = await createFixture();

  await assert.rejects(() => service.submitInquiry(cookieHeader, { type: 'business', id: 'suspended-business' }, validInquiry, 'idem-suspended-01'), ContactBusinessUnavailableError);
});

test('private data is not exposed in inquiry receipt', async () => {
  const { service, cookieHeader } = await createFixture();
  const receipt = await service.submitInquiry(cookieHeader, { type: 'business', id: 'approved-business' }, validInquiry, 'idem-approved-0001');

  assert.deepEqual(Object.keys(receipt).sort(), ['businessProfileId', 'createdAt', 'id', 'status', 'targetType', 'trackingStatus']);
  assert.equal('contactEmail' in receipt, false);
  assert.equal('message' in receipt, false);
  assert.equal('ownerUserId' in receipt, false);
});

test('same retry and concurrent double submit return one canonical receipt', async () => {
  const { service, cookieHeader, pool } = await createFixture();
  const target = { type: 'business' as const, id: 'approved-business' };
  const [first, retry] = await Promise.all([
    service.submitInquiry(cookieHeader, target, validInquiry, 'idem-concurrent-0001'),
    service.submitInquiry(cookieHeader, target, validInquiry, 'idem-concurrent-0001')
  ]);
  assert.deepEqual(retry, first);
  const rows = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM contact_inquiries');
  assert.equal(rows[0].count, '1');
});

test('conflicting reuse is denied while a different key creates a legal second inquiry', async () => {
  const { service, cookieHeader, pool } = await createFixture();
  const target = { type: 'business' as const, id: 'approved-business' };
  await service.submitInquiry(cookieHeader, target, validInquiry, 'idem-conflict-00001');
  await assert.rejects(
    service.submitInquiry(cookieHeader, target, { ...validInquiry, message: `${validInquiry.message} تغيير` }, 'idem-conflict-00001'),
    ContactIdempotencyConflictError
  );
  await service.submitInquiry(cookieHeader, target, validInquiry, 'idem-different-0001');
  const rows = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM contact_inquiries');
  assert.equal(rows[0].count, '2');
});

test('Professional target uses the same idempotency contract', async () => {
  const { service, cookieHeader } = await createFixture();
  const target = { type: 'professional' as const, id: 'professional_profile_contact_1' };
  const first = await service.submitInquiry(cookieHeader, target, validInquiry, 'idem-professional-01');
  const retry = await service.submitInquiry(cookieHeader, target, validInquiry, 'idem-professional-01');
  assert.equal(first.id, retry.id);
  assert.equal(first.professionalProfileId, target.id);
});

test('same opaque key is isolated by authenticated submitter', async () => {
  const { service, identityRepository, cookieHeader, pool } = await createFixture();
  const secondIdentity = new IdentityService(identityRepository, new SessionTokenService());
  const registration = await secondIdentity.register({ email: 'second@example.com', password: 'very-secure-password', displayName: 'مستخدم ثان' });
  await pool.query(`UPDATE core_user_accounts SET account_status = 'active', lifecycle_status = 'active' WHERE user_identifier = $1`, [registration.user.id]);
  const login = await secondIdentity.login({ email: 'second@example.com', password: 'very-secure-password' });
  const secondCookie = `khedmah_session=${login.sessionToken}`;
  const target = { type: 'business' as const, id: 'approved-business' };
  const first = await service.submitInquiry(cookieHeader, target, validInquiry, 'idem-shared-users-01');
  const second = await service.submitInquiry(secondCookie, target, validInquiry, 'idem-shared-users-01');
  assert.notEqual(first.id, second.id);
  const rows = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM contact_inquiries');
  assert.equal(rows[0].count, '2');
});

test('validation works for inquiry payloads', async () => {
  const { service, cookieHeader } = await createFixture();

  await assert.rejects(
    () => service.submitInquiry(cookieHeader, { type: 'business', id: 'approved-business' }, { name: 'س', contactEmail: 'not-email', message: 'قصير' }, 'idem-invalid-00001'),
    ContactValidationError
  );
});

test('contact click tracking records contact intent only', async () => {
  const { pool, service, cookieHeader } = await createFixture();
  const receipt = await service.trackContactClick(cookieHeader, 'approved-business', { source: 'profile' });

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.actionType, 'contact_click');
  const rows = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM contact_action_events');
  assert.equal(rows[0].count, '1');
  assert.deepEqual(Object.keys(receipt).sort(), ['actionType', 'businessProfileId', 'id', 'trackedAt']);
});

test('rate limit preparation exists for contact inquiries', async () => {
  const { service, cookieHeader } = await createFixture();

  for (let index = 0; index < 10; index += 1) {
    await service.submitInquiry(cookieHeader, { type: 'business', id: 'approved-business' }, { ...validInquiry, message: `أرغب في معرفة تفاصيل الخدمة المتاحة لديكم رقم ${index}.` }, `idem-rate-limit-${index.toString().padStart(4, '0')}`);
  }

  await assert.rejects(
    () => service.submitInquiry(cookieHeader, { type: 'business', id: 'approved-business' }, { ...validInquiry, message: 'أرغب في معرفة تفاصيل الخدمة المتاحة لديكم مرة إضافية.' }, 'idem-rate-limit-extra'),
    ContactRateLimitError
  );
});

test('ContactRateLimitError carries HTTP 429 status and safe message', () => {
  const error = new ContactRateLimitError();

  assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
  assert.equal(error.getStatus(), 429);
  assert.equal(error.message, 'Contact rate limit exceeded.');
});
