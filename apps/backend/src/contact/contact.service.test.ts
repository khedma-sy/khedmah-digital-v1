import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { HttpStatus } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactBusinessUnavailableError, ContactRateLimitError, ContactValidationError } from './contact.errors';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { ContactService } from './contact.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { PlatformLogger } from '../logging/platform-logger';

const rawPool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: parseInt(process.env.PGPORT ?? '5432', 10),
  user: process.env.PGUSER ?? 'khedmah',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? 'khedmah_dev'
});

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
      business_profile_id TEXT NOT NULL,
      submitter_user_id TEXT NOT NULL REFERENCES user_accounts(id),
      name TEXT NOT NULL, contact_email TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      request_id TEXT, correlation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS contact_actions (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      actor_user_id TEXT,
      action_type TEXT NOT NULL,
      request_id TEXT, correlation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('TRUNCATE contact_actions, contact_inquiries, business_profiles, audit_logs, user_sessions, user_profiles, user_accounts CASCADE');

  const identityRepository = new IdentityRepository(pool);
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const contacts = new ContactRepository(pool);
  const logger = new PlatformLogger();
  logger.log = () => undefined;
  const service = new ContactService(contacts, identity, identityRepository, new ContactRateLimitService(), new ContactAbuseService(), logger);
  const registration = await identity.register({ email: 'user@example.com', password: 'very-secure-password', displayName: 'زائر خدمة' });
  const cookieHeader = `khedmah_session=${registration.sessionToken}`;

  await pool.query(
    `INSERT INTO user_accounts (id, email, password_hash, status, created_at, updated_at)
     VALUES ('owner-user', 'owner@biz.example', 'placeholder-hash', 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO business_profiles (id, name, owner_user_id, visibility, trust_status, status, category_code, city_code, country_code, created_at, updated_at)
     VALUES
       ('approved-business', 'معمل الاختبار', 'owner-user', 'public', 'approved', 'active', 'restaurant', 'damascus', 'SY', NOW(), NOW()),
       ('private-business', 'عمل خاص', 'owner-user', 'private', 'approved', 'active', 'restaurant', 'damascus', 'SY', NOW(), NOW()),
       ('suspended-business', 'عمل موقوف', 'owner-user', 'public', 'suspended', 'active', 'restaurant', 'damascus', 'SY', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
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
  const receipt = await service.submitInquiry(cookieHeader, 'approved-business', validInquiry);

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.status, 'submitted');
  assert.equal((await contacts.listContactInquiries('approved-business')).length, 1);
  const logs = await identityRepository.listAuditLogs();
  assert.ok(logs.some((event) => event.eventType === 'contact.inquiry.submitted'));
});

test('non-public business rejects inquiry', async () => {
  const { service, cookieHeader } = await createFixture();

  await assert.rejects(() => service.submitInquiry(cookieHeader, 'private-business', validInquiry), ContactBusinessUnavailableError);
});

test('suspended business rejects inquiry', async () => {
  const { service, cookieHeader } = await createFixture();

  await assert.rejects(() => service.submitInquiry(cookieHeader, 'suspended-business', validInquiry), ContactBusinessUnavailableError);
});

test('private data is not exposed in inquiry receipt', async () => {
  const { service, cookieHeader } = await createFixture();
  const receipt = await service.submitInquiry(cookieHeader, 'approved-business', validInquiry);

  assert.deepEqual(Object.keys(receipt).sort(), ['businessProfileId', 'createdAt', 'id', 'status']);
  assert.equal('contactEmail' in receipt, false);
  assert.equal('message' in receipt, false);
  assert.equal('ownerUserId' in receipt, false);
});

test('validation works for inquiry payloads', async () => {
  const { service, cookieHeader } = await createFixture();

  await assert.rejects(
    () => service.submitInquiry(cookieHeader, 'approved-business', { name: 'س', contactEmail: 'not-email', message: 'قصير' }),
    ContactValidationError
  );
});

test('contact click tracking records contact intent only', async () => {
  const { pool, service, cookieHeader } = await createFixture();
  const receipt = await service.trackContactClick(cookieHeader, 'approved-business', { source: 'profile' });

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.actionType, 'contact_click');
  const rows = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM contact_actions');
  assert.equal(rows[0].count, '1');
  assert.deepEqual(Object.keys(receipt).sort(), ['actionType', 'businessProfileId', 'id', 'trackedAt']);
});

test('rate limit preparation exists for contact inquiries', async () => {
  const { service, cookieHeader } = await createFixture();

  for (let index = 0; index < 10; index += 1) {
    await service.submitInquiry(cookieHeader, 'approved-business', { ...validInquiry, message: `أرغب في معرفة تفاصيل الخدمة المتاحة لديكم رقم ${index}.` });
  }

  await assert.rejects(
    () => service.submitInquiry(cookieHeader, 'approved-business', { ...validInquiry, message: 'أرغب في معرفة تفاصيل الخدمة المتاحة لديكم مرة إضافية.' }),
    ContactRateLimitError
  );
});

test('ContactRateLimitError carries HTTP 429 status and safe message', () => {
  const error = new ContactRateLimitError();

  assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
  assert.equal(error.getStatus(), 429);
  assert.equal(error.message, 'Contact rate limit exceeded.');
});
