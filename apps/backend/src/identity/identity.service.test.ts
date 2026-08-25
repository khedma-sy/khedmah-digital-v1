import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { SessionTokenService } from './security/session-token.service';

const rawPool = createTestPool();

async function setup(): Promise<{ repository: IdentityRepository; service: IdentityService; pool: DatabasePool }> {
  await resetCanonicalTestSchema(rawPool);
  const pool = DatabasePool.fromPool(rawPool);
  await pool.query('TRUNCATE audit_logs, identity_sessions, email_verifications, password_reset_tokens, external_identities, identity_credentials, profiles, core_user_accounts CASCADE');
  const repository = new IdentityRepository(pool);
  return { repository, service: new IdentityService(repository, new SessionTokenService()), pool };
}

async function activate(pool: DatabasePool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE core_user_accounts
     SET account_status = 'active', lifecycle_status = 'active', updated_at = NOW()
     WHERE user_identifier = $1`,
    [userId]
  );
}

test('register creates a pending account without a session and never stores the plain password', async () => {
  const { repository, service } = await setup();
  const result = await service.register({
    email: 'Owner@Example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  const account = await repository.findAccountByEmail('owner@example.com');
  assert.ok(account);
  assert.equal(account.status, 'pending');
  assert.notEqual(account.passwordHash, 'very-secure-password');
  assert.equal(result.verificationRequired, true);
  assert.equal(result.user.email, 'owner@example.com');
  assert.equal(result.user.profile.locale, 'ar');
  assert.equal('sessionToken' in result, false);
  const logs = await repository.listAuditLogs();
  assert.ok(logs.some((l) => l.eventType === 'auth.register'));
});

test('login fails closed while email verification is pending and succeeds after activation', async () => {
  const { repository, service, pool } = await setup();
  const registration = await service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  await assert.rejects(
    () => service.login({ email: 'owner@example.com', password: 'very-secure-password' }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.equal((error.getResponse() as { code?: string }).code, 'EMAIL_VERIFICATION_REQUIRED');
      return true;
    }
  );

  await activate(pool, registration.user.id);
  const login = await service.login({ email: 'owner@example.com', password: 'very-secure-password' });
  assert.equal(login.user.email, 'owner@example.com');

  await assert.rejects(
    () => service.login({ email: 'owner@example.com', password: 'wrong-password-value' }),
    UnauthorizedException
  );
  const logs = await repository.listAuditLogs();
  assert.ok(logs.some((event) => event.eventType === 'auth.login_failed'));
  assert.ok(logs.some((event) => event.eventType === 'auth.login_success'));
});

test('session lookup and protected current user access require a verified active login session', async () => {
  const { service, pool } = await setup();
  const registration = await service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });
  await activate(pool, registration.user.id);
  const login = await service.login({ email: 'owner@example.com', password: 'very-secure-password' });

  assert.equal((await service.getSession(login.sessionToken))?.email, 'owner@example.com');
  await assert.rejects(() => service.getCurrentUser(undefined), UnauthorizedException);
});

test('logout revokes an active session', async () => {
  const { service, pool } = await setup();
  const registration = await service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });
  await activate(pool, registration.user.id);
  const login = await service.login({ email: 'owner@example.com', password: 'very-secure-password' });

  await service.logout(login.sessionToken);
  assert.equal(await service.getSession(login.sessionToken), undefined);
});
