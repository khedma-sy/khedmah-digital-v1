import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069J documents current credential session and cookie runtime accurately', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  for (const value of ['PBKDF2-SHA512', '120,000 iterations', 'SHA-256 token hash', 'One hour', 'HTTP-only', 'SameSite Strict']) assert.match(doc, new RegExp(value));
  assert.match(doc, /no NestJS guard, Passport strategy, or authentication middleware/);
  assert.match(doc, /Refresh token.*Not implemented/);
});

test('Mission 069J separates runtime authentication from canonical authority', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  assert.match(doc, /Runtime authentication owns/);
  assert.match(doc, /Canonical Identity, Users, and Profiles own/);
  assert.match(doc, /Credential verification must not decide canonical lifecycle transitions/);
  assert.match(doc, /Session validity alone never authorizes a use case/);
});

test('Mission 069J forbids credential data in all governed identity entity records', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  for (const entity of ['core_user_accounts', 'profiles', 'professional_profiles', 'business_profiles', 'organizations']) assert.match(doc, new RegExp(`\\b${entity}\\b`));
  assert.match(doc, /must \*\*never\*\* store password hashes, plaintext passwords, raw tokens, token hashes, session records, cookie values, refresh tokens, recovery secrets, credential secrets/);
  assert.match(doc, /not a table, model, migration, or storage authorization/);
});

test('Mission 069J defines minimal authenticated subject and ordered session checks', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  assert.match(doc, /identityReference.*userIdentifier/);
  assert.match(doc, /cookie\/token transport validation[\s\S]*session hash\/expiry\/revocation validation[\s\S]*canonical account lifecycle eligibility/);
  assert.match(doc, /No step may be skipped or duplicated by a feature module/);
});

test('Mission 069J maps required errors while preserving generic authentication failures', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  for (const code of ['USER_ACCOUNT_INVALID', 'USER_ACCOUNT_LIFECYCLE_INVALID', 'IDENTITY_INVALID', 'FORBIDDEN_ACTION']) assert.match(doc, new RegExp(`\\b${code}\\b`));
  assert.match(doc, /generic authentication failure response/);
  assert.match(doc, /must not expose `USER_ACCOUNT_LIFECYCLE_INVALID` from login/);
});

test('Mission 069J audit boundary excludes all credential and token material', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  for (const event of ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_CREATED', 'SESSION_REVOKED']) assert.match(doc, new RegExp(`\\b${event}\\b`));
  assert.match(doc, /must never contain/);
  for (const forbidden of ['plaintext passwords', 'raw tokens', 'token hashes', 'cookies', 'authorization headers', 'normalized email']) assert.match(doc, new RegExp(forbidden, 'i'));
});

test('Mission 069J preserves framework neutrality security and KILL CRITICAL scope', async () => {
  const doc = await read('docs/contracts/CREDENTIAL-SESSION-BOUNDARY-CONTRACT.md');
  assert.match(doc, /Canonical Identity, Users, Profiles, core, and shared modules must not import or reference/);
  for (const forbidden of ['marketplace account', 'payment credential', 'seller authentication', 'commission account', 'social login graph', 'tracking identity', 'AI identity scoring']) assert.match(doc, new RegExp(forbidden, 'i'));
  assert.match(doc, /KILL CRITICAL result: PASS/);
  assert.match(doc, /CREDENTIAL BOUNDARY STATUS: READY FOR ADAPTER IMPLEMENTATION/);
  assert.match(doc, /Durable credential\/session persistence and production authentication remain unauthorized/);
});
