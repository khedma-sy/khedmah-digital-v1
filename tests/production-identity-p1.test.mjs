import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('registration is gated by email verification and recovery is not a no-op', async () => {
  const controller = await read('apps/backend/src/identity/auth.controller.ts');
  const service = await read('apps/backend/src/identity/identity.service.ts');
  const recovery = await read('apps/backend/src/identity/password/password-recovery.service.ts');

  assert.match(service, /status:\s*'pending'/);
  assert.match(controller, /requestVerification\(result\.user\.id, result\.user\.email\)/);
  assert.doesNotMatch(controller, /forgotPassword\([^)]*\)\s*\{\s*return \{ message:/s);
  assert.match(recovery, /password_reset_tokens/);
  assert.match(recovery, /hashToken/);
  assert.match(recovery, /used_at/);
  assert.match(recovery, /identity_sessions SET revoked_at = NOW\(\)/);
});

test('Google sign-in terminates in canonical backend session', async () => {
  const controller = await read('apps/backend/src/identity/auth.controller.ts');
  const google = await read('apps/backend/src/identity/oauth/google-login.service.ts');
  const firebase = await read('apps/backend/src/identity/oauth/firebase-auth.service.ts');
  const login = await read('apps/frontend/app/auth/login/page.tsx');

  assert.match(controller, /@Post\("google"\)/);
  assert.match(controller, /attachSessionCookie\(response, result\.sessionToken\)/);
  assert.match(firebase, /identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/);
  assert.match(firebase, /providerId === 'google\.com'/);
  assert.match(google, /oauth_identities/);
  assert.match(google, /saveSession/);
  assert.match(login, /signInWithGoogle/);
  assert.match(login, /productionAuth\.google/);
});

test('migration 020 governs reset tokens and OAuth identities', async () => {
  const migration = await read('backend/migrations/versions/020_identity_recovery_oauth.sql');
  const migrator = await read('apps/backend/src/database/database.migrator.ts');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS oauth_identities/);
  assert.match(migration, /UNIQUE \(provider, provider_subject\)/);
  assert.match(migrator, /REQUIRED_CANONICAL_SCHEMA_VERSION = '020'/);
});
