import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('identity backend exposes only approved auth and user profile endpoints', async () => {
  const auth = await read('apps/backend/src/identity/auth.controller.ts');
  const users = await read('apps/backend/src/identity/users.controller.ts');

  assert.match(auth, /@Post\('register'\)/);
  assert.match(auth, /@Post\('login'\)/);
  assert.match(auth, /@Post\('logout'\)/);
  assert.match(auth, /@Get\('session'\)/);
  assert.match(users, /@Get\('me'\)/);
  assert.match(users, /@Patch\('me\/profile'\)/);
});

test('identity database SQL creates only allowed tables', async () => {
  const sql = await read('infra/database/001_identity_foundation.sql');
  const tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]).sort();

  assert.deepEqual(tables, ['audit_logs', 'user_accounts', 'user_profiles']);
  assert.doesNotMatch(sql, /organizations|business_profiles|categories|locations|marketplace|payments|messaging|analytics/i);
});

test('identity security avoids plain password and stores session tokens as hashes', async () => {
  const passwordSecurity = await read('apps/backend/src/identity/security/password-security.ts');
  const sessionTokens = await read('apps/backend/src/identity/security/session-token.service.ts');
  const types = await read('apps/backend/src/identity/identity.types.ts');

  assert.match(passwordSecurity, /pbkdf2Sync/);
  assert.match(passwordSecurity, /timingSafeEqual/);
  assert.match(sessionTokens, /sha256/);
  assert.match(types, /passwordHash/);
  assert.match(types, /tokenHash/);
  assert.doesNotMatch(types, /plainPassword|password:\s*string/);
});
