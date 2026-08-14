import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { SessionTokenService } from './security/session-token.service';


const rawPool = createTestPool();

async function setup(): Promise<{ repository: IdentityRepository; service: IdentityService }> {
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
  `);
  await pool.query('TRUNCATE audit_logs, identity_sessions, identity_credentials, profiles, core_user_accounts, user_sessions, user_profiles, user_accounts CASCADE');

  const repository = new IdentityRepository(pool);
  return { repository, service: new IdentityService(repository, new SessionTokenService()) };
}

test('register creates an active account, profile, session, and audit event without plain password storage', async () => {
  const { repository, service } = await setup();
  const result = await service.register({
    email: 'Owner@Example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  const account = await repository.findAccountByEmail('owner@example.com');

  assert.ok(account);
  assert.equal(account.status, 'active');
  assert.notEqual(account.passwordHash, 'very-secure-password');
  assert.equal(result.user.email, 'owner@example.com');
  assert.equal(result.user.profile.locale, 'ar');
  const logs = await repository.listAuditLogs();
  assert.ok(logs.some((l) => l.eventType === 'auth.register'));
});

test('login succeeds with a valid password and rejects an invalid password safely', async () => {
  const { repository, service } = await setup();
  await service.register({ email: 'owner@example.com', password: 'very-secure-password', displayName: 'مالك الحساب' });

  const login = await service.login({ email: 'owner@example.com', password: 'very-secure-password' });
  assert.equal(login.user.email, 'owner@example.com');

  await assert.rejects(() => service.login({ email: 'owner@example.com', password: 'wrong-password-value' }), UnauthorizedException);
  const logs = await repository.listAuditLogs();
  assert.ok(logs.some((event) => event.eventType === 'auth.login_failed'));
});

test('session lookup and protected current user access require a valid session token', async () => {
  const { service } = await setup();
  const registration = await service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  assert.equal((await service.getSession(registration.sessionToken))?.email, 'owner@example.com');
  await assert.rejects(() => service.getCurrentUser(undefined), UnauthorizedException);
});

test('logout revokes an active session', async () => {
  const { service } = await setup();
  const registration = await service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  await service.logout(registration.sessionToken);
  assert.equal(await service.getSession(registration.sessionToken), undefined);
});
