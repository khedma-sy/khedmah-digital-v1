import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069I contract fixes canonical identifier authority and separation', async () => {
  const doc = await read('docs/contracts/IDENTITY-IDENTIFIER-LIFECYCLE-RECONCILIATION-CONTRACT.md');
  for (const identifier of ['identity_reference', 'user_identifier', 'profile_identifier']) assert.match(doc, new RegExp(`\\b${identifier}\\b`));
  assert.match(doc, /always distinct values/);
  assert.match(doc, /email as authority/);
  assert.match(doc, /Identity → User Account → Profile Separation/);
  assert.match(doc, /one-to-one/);
});

test('Mission 069I contract reconciles lifecycle without allowing lossy disabled mapping', async () => {
  const doc = await read('docs/contracts/IDENTITY-IDENTIFIER-LIFECYCLE-RECONCILIATION-CONTRACT.md');
  for (const state of ['created', 'pending', 'active', 'suspended', 'archived']) assert.match(doc, new RegExp(`\\b${state}\\b`, 'i'));
  assert.match(doc, /Created → Pending → Active/);
  assert.match(doc, /disabled.*Unresolved/i);
  assert.match(doc, /never default to Suspended or Archived/);
  assert.match(doc, /must be equal at persistence boundaries/);
});

test('Mission 069I contract keeps credentials and sessions outside canonical records', async () => {
  const doc = await read('docs/contracts/IDENTITY-IDENTIFIER-LIFECYCLE-RECONCILIATION-CONTRACT.md');
  assert.match(doc, /core_user_accounts.*profiles store no email, password hash, token hash, cookie, credential secret, or session payload/i);
  assert.match(doc, /Runtime authority retained/);
  assert.match(doc, /Canonical authority/);
  assert.match(doc, /generic invalid-credential behavior/);
});

test('Mission 069I contract maps required errors and audit events safely', async () => {
  const doc = await read('docs/contracts/IDENTITY-IDENTIFIER-LIFECYCLE-RECONCILIATION-CONTRACT.md');
  for (const code of ['USER_ACCOUNT_INVALID', 'USER_ACCOUNT_DUPLICATE', 'USER_ACCOUNT_LIFECYCLE_INVALID', 'PROFILE_INVALID', 'PROFILE_OWNERSHIP_INVALID']) assert.match(doc, new RegExp(`\\b${code}\\b`));
  for (const event of ['USER_ACCOUNT_CREATED', 'PROFILE_CREATED', 'PROFILE_UPDATED', 'USER_ACCOUNT_STATUS_CHANGED']) assert.match(doc, new RegExp(`\\b${event}\\b`));
  assert.match(doc, /must never contain email, password, password hash, session token\/hash, cookie/);
});

test('Mission 069I contract defines database and adapter impact without implementation', async () => {
  const doc = await read('docs/contracts/IDENTITY-IDENTIFIER-LIFECYCLE-RECONCILIATION-CONTRACT.md');
  assert.match(doc, /Migration 002/);
  assert.match(doc, /No migration is created or authorized/);
  for (const boundary of ['Identity transport adapter', 'Identifier generator/mapping port', 'Credential verifier port', 'Session port', 'User Account application port', 'Profile application port', 'Error adapter', 'Audit port']) assert.match(doc, new RegExp(boundary.replace('/', '\\/')));
  assert.match(doc, /No adapter implementation, provider registration, controller wiring, or use case is introduced/);
});

test('Mission 069I preserves security and KILL CRITICAL boundaries', async () => {
  const doc = await read('docs/contracts/IDENTITY-IDENTIFIER-LIFECYCLE-RECONCILIATION-CONTRACT.md');
  assert.match(doc, /one runtime credential\/session mechanism/);
  assert.match(doc, /KILL CRITICAL result: PASS/);
  for (const forbidden of ['marketplace account', 'seller identity', 'payment identity', 'commission identity', 'social identity', 'tracking identity', 'AI scoring identity']) assert.match(doc, new RegExp(forbidden, 'i'));
  assert.match(doc, /IDENTITY RECONCILIATION STATUS: REQUIRES FURTHER RECONCILIATION/);
});
