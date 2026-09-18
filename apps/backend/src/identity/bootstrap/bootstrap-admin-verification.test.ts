import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { EmailVerificationService } from '../email/email-verification.service';
import { IdentityRepository } from '../identity.repository';
import { UserAccount, UserProfile } from '../identity.types';
import { SessionTokenService } from '../security/session-token.service';

const secret = 'bootstrap-verification-test-'.padEnd(40, 'x');
const request = { email: ' Admin@khedmah.example ', password: 'verification-test-password', displayName: 'Admin' };
let originalSecret: string | undefined;
beforeEach(() => { originalSecret = process.env.BOOTSTRAP_ADMIN_SECRET; process.env.BOOTSTRAP_ADMIN_SECRET = secret; });
afterEach(() => {
  if (originalSecret === undefined) delete process.env.BOOTSTRAP_ADMIN_SECRET;
  else process.env.BOOTSTRAP_ADMIN_SECRET = originalSecret;
});

function fixture(options: { existing?: boolean; loseRace?: boolean; send?: () => Promise<void> } = {}) {
  const accounts: UserAccount[] = [];
  const deliveries: Array<{ userId: string; email: string }> = [];
  const repository = {
    async hasAdminAccount() { return Boolean(options.existing || accounts.length); },
    async createBootstrapAdmin(account: UserAccount, profile: UserProfile, role: string) {
      assert.equal(profile.userId, account.id);
      assert.equal(role, 'bootstrap_admin');
      if (options.loseRace) return false;
      accounts.push(account);
      return true;
    }
  } as unknown as IdentityRepository;
  const verification = {
    async requestVerification(userId: string, email: string) {
      assert.equal(accounts[0]?.id, userId, 'account must be committed before email is requested');
      assert.equal(accounts[0]?.status, 'pending');
      deliveries.push({ userId, email });
      await options.send?.();
    }
  } as unknown as EmailVerificationService;
  return { service: new BootstrapAdminService(repository, new SessionTokenService(), verification), accounts, deliveries };
}

test('bootstrap persists a pending account and requests verification for the normalized address', async () => {
  const { service, accounts, deliveries } = fixture();
  const result = await service.bootstrap(secret, request);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].status, 'pending');
  assert.deepEqual(deliveries, [{ userId: result.userId, email: 'admin@khedmah.example' }]);
  assert.match(result.message, /pending email verification/);
  assert.equal(await service.isBootstrapAvailable(), false);
});

test('invalid bootstrap secret cannot create an account or send email', async () => {
  const { service, accounts, deliveries } = fixture();
  await assert.rejects(service.bootstrap('incorrect', request), ForbiddenException);
  assert.equal(accounts.length, 0);
  assert.equal(deliveries.length, 0);
});

test('invalid input cannot create an account or send email', async () => {
  const { service, accounts, deliveries } = fixture();
  await assert.rejects(service.bootstrap(secret, { ...request, password: 'short' }), ForbiddenException);
  assert.equal(accounts.length, 0);
  assert.equal(deliveries.length, 0);
});

test('an existing administrator prevents a second bootstrap email', async () => {
  const { service, accounts, deliveries } = fixture({ existing: true });
  await assert.rejects(service.bootstrap(secret, request), ConflictException);
  assert.equal(accounts.length, 0);
  assert.equal(deliveries.length, 0);
});

test('the loser of the atomic creation race cannot send a verification email', async () => {
  const { service, accounts, deliveries } = fixture({ loseRace: true });
  await assert.rejects(service.bootstrap(secret, request), ConflictException);
  assert.equal(accounts.length, 0);
  assert.equal(deliveries.length, 0);
});

test('delivery failure keeps the account pending and exposes only safe resend guidance', async () => {
  const { service, accounts, deliveries } = fixture({ send: async () => { throw new Error('private-provider-diagnostic'); } });
  await assert.rejects(service.bootstrap(secret, request), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailableException);
    assert.equal(error.getStatus(), 503);
    assert.match(error.message, /Request a new verification email; do not bootstrap again/);
    assert.doesNotMatch(error.message, /private-provider-diagnostic/);
    return true;
  });
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].status, 'pending');
  assert.equal(await service.isBootstrapAvailable(), false);
  await assert.rejects(service.bootstrap(secret, request), ConflictException);
  assert.equal(deliveries.length, 1);
});

test('bootstrap waits for the email provider before returning success', async () => {
  let release!: () => void;
  let entered!: () => void;
  const sending = new Promise<void>((resolve) => { entered = resolve; });
  const delivery = new Promise<void>((resolve) => { release = resolve; });
  const { service } = fixture({ send: async () => { entered(); await delivery; } });
  let completed = false;
  const result = service.bootstrap(secret, request).then(() => { completed = true; });
  await sending;
  assert.equal(completed, false);
  release();
  await result;
  assert.equal(completed, true);
});
