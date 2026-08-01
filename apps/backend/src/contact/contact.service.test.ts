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
  `);
  await pool.query('TRUNCATE audit_logs, user_sessions, user_profiles, user_accounts CASCADE');

  const identityRepository = new IdentityRepository(pool);
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const contacts = new ContactRepository();
  const logger = new PlatformLogger();
  logger.log = () => undefined;
  const service = new ContactService(contacts, identity, identityRepository, new ContactRateLimitService(), new ContactAbuseService(), logger);
  const registration = await identity.register({ email: 'user@example.com', password: 'very-secure-password', displayName: 'زائر خدمة' });
  const cookieHeader = `khedmah_session=${registration.sessionToken}`;

  contacts.saveBusinessProfileSnapshot({ id: 'approved-business', visibility: 'public', trustStatus: 'approved', ownerUserId: 'owner-user' });
  contacts.saveBusinessProfileSnapshot({ id: 'private-business', visibility: 'private', trustStatus: 'approved', ownerUserId: 'owner-user' });
  contacts.saveBusinessProfileSnapshot({ id: 'suspended-business', visibility: 'public', trustStatus: 'suspended', ownerUserId: 'owner-user' });

  return { contacts, identityRepository, service, cookieHeader };
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
  assert.equal(contacts.listContactInquiries().length, 1);
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
  const { contacts, service, cookieHeader } = await createFixture();
  const receipt = await service.trackContactClick(cookieHeader, 'approved-business', { source: 'profile' });

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.actionType, 'contact_click');
  assert.equal(contacts.listContactActions().length, 1);
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
