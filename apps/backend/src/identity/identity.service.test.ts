import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { SessionTokenService } from './security/session-token.service';

function createService() {
  const repository = new IdentityRepository();
  return {
    repository,
    service: new IdentityService(repository, new SessionTokenService())
  };
}

test('register creates an active account, profile, session, and audit event without plain password storage', () => {
  const { repository, service } = createService();
  const result = service.register({
    email: 'Owner@Example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  const account = repository.findAccountByEmail('owner@example.com');

  assert.ok(account);
  assert.equal(account.status, 'active');
  assert.notEqual(account.passwordHash, 'very-secure-password');
  assert.equal(result.user.email, 'owner@example.com');
  assert.equal(result.user.profile.locale, 'ar');
  assert.equal(repository.listAuditLogs()[0].eventType, 'auth.register');
});

test('login succeeds with a valid password and rejects an invalid password safely', () => {
  const { repository, service } = createService();
  service.register({ email: 'owner@example.com', password: 'very-secure-password', displayName: 'مالك الحساب' });

  const login = service.login({ email: 'owner@example.com', password: 'very-secure-password' });
  assert.equal(login.user.email, 'owner@example.com');

  assert.throws(() => service.login({ email: 'owner@example.com', password: 'wrong-password-value' }), UnauthorizedException);
  assert.ok(repository.listAuditLogs().some((event) => event.eventType === 'auth.login_failed'));
});

test('session lookup and protected current user access require a valid session token', () => {
  const { service } = createService();
  const registration = service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  assert.equal(service.getSession(registration.sessionToken)?.email, 'owner@example.com');
  assert.throws(() => service.getCurrentUser(undefined), UnauthorizedException);
});

test('logout revokes an active session', () => {
  const { service } = createService();
  const registration = service.register({
    email: 'owner@example.com',
    password: 'very-secure-password',
    displayName: 'مالك الحساب'
  });

  service.logout(registration.sessionToken);
  assert.equal(service.getSession(registration.sessionToken), undefined);
});
