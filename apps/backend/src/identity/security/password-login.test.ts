import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import { hashPassword, passwordNeedsRehash, verifyLoginPassword } from './password-security';

test('missing email always returns false even for the dummy source password', () => {
  assert.equal(verifyLoginPassword('random user password', undefined), false);
  assert.equal(verifyLoginPassword('not-a-valid-user-password', undefined), false);
});

test('real password match succeeds, wrong password fails and weak legacy hashes remain verifiable', () => {
  const hashed = hashPassword('correct-password-for-test');
  assert.match(hashed, /^pbkdf2_sha512\$220000\$/);
  assert.equal(verifyLoginPassword('correct-password-for-test', hashed), true);
  assert.equal(verifyLoginPassword('wrong-password-for-test', hashed), false);
  const salt = 'legacy-test';
  const legacy = `pbkdf2_sha512$120000$${salt}$${pbkdf2Sync('correct-password-for-test', salt, 120_000, 64, 'sha512').toString('base64url')}`;
  assert.equal(verifyLoginPassword('correct-password-for-test', legacy), true);
  assert.equal(passwordNeedsRehash(legacy), true);
  assert.equal(passwordNeedsRehash(hashed), false);
});

test('malformed account hash fails closed; no fallback login is possible', () => {
  assert.equal(verifyLoginPassword('some-password', 'malformed'), false);
});
