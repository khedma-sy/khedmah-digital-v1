import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069K documents the current runtime profile and organization assumptions', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  assert.match(doc, /no independent Profile NestJS module, profile service, profile repository, or profile controller/);
  assert.match(doc, /same `userId`/);
  assert.match(doc, /duplicates owner-of-record and membership-role authority/);
  assert.match(doc, /No professional profile runtime model exists/);
  assert.match(doc, /ContactBusinessProfileSnapshot.*not canonical business identity or ownership authority/);
});

test('Mission 069K establishes one canonical authority model across profile entities', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  for (const entity of ['Identity', 'User Account', 'Base Profile', 'Professional Profile', 'Business Profile', 'Organization', 'Relationship']) assert.match(doc, new RegExp(`\\b${entity}\\b`));
  assert.match(doc, /Relationships module connects governed subject and target references\. It does not own either entity/);
  assert.match(doc, /“Owns identity” means the module is authoritative/);
});

test('Mission 069K prevents implicit profile type and ownership mappings', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  for (const type of ['Personal Profile', 'Professional Profile', 'Business Profile', 'Organization Profile', 'Partner Profile', 'Representative Profile']) assert.match(doc, new RegExp(type));
  assert.match(doc, /Account type does not automatically select or create a profile type/);
  assert.match(doc, /adapter cannot infer other types/);
  assert.match(doc, /owner-of-record and membership are distinct references/i);
});

test('Mission 069K defines safe visibility projections and independent lifecycles', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  for (const visibility of ['Public', 'Private', 'Internal']) assert.match(doc, new RegExp(`\\*\\*${visibility}:\\*\\*`));
  assert.match(doc, /Public organization[\s\S]*`ownerUserId`, member user ids\/roles/);
  assert.match(doc, /Private email\/contact and internal metadata are deny-by-default/);
  assert.match(doc, /Created[\s\S]*Pending[\s\S]*Active[\s\S]*Suspended[\s\S]*Archived/);
  assert.match(doc, /maintain independent state/);
});

test('Mission 069K records migration order and blocks physical implementation', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  assert.match(doc, /001 core_user_accounts[\s\S]*002 profiles[\s\S]*003 professional_profiles[\s\S]*004 business_profiles[\s\S]*005 organizations/);
  assert.match(doc, /This document creates no migration/);
  assert.match(doc, /Organization-managed Business Profile ownership.*requires an additive relationship\/owner strategy/);
});

test('Mission 069K defines required adapters without wiring behavior', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  for (const adapter of ['Profile Adapter', 'Professional Profile Adapter', 'Business Profile Adapter', 'Organization Adapter', 'Ownership Reference Adapter', 'Visibility Projection Adapter', 'Lifecycle Adapter', 'Relationship Adapter']) assert.match(doc, new RegExp(adapter));
  assert.match(doc, /No adapter implementation, provider registration, API wiring, database query, or behavior replacement is authorized/);
});

test('Mission 069K preserves security ownership and KILL CRITICAL boundaries', async () => {
  const doc = await read('docs/contracts/PROFILE-OWNERSHIP-RECONCILIATION-CONTRACT.md');
  assert.match(doc, /owner-of-record, manager role, membership, and relationship are distinct concepts/);
  assert.match(doc, /store no password, token, cookie, session, credential secret/);
  for (const forbidden of ['marketplace ownership', 'seller profile', 'payment ownership', 'commission ownership', 'social profile', 'tracking profile', 'AI identity scoring']) assert.match(doc, new RegExp(forbidden, 'i'));
  assert.match(doc, /KILL CRITICAL result: PASS/);
  assert.match(doc, /PROFILE OWNERSHIP STATUS: REQUIRES FURTHER RECONCILIATION/);
});
