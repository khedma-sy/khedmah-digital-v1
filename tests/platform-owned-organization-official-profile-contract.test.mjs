import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('platform-owned organization contract exists and records repository identity', async () => {
  const doc = await read('docs/contracts/PLATFORM-OWNED-ORGANIZATION-OFFICIAL-PROFILE-CONTRACT.md');

  assert.match(doc, /# Platform-Owned Organization & Official Khedmah Digital Profile Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('official Khedmah Digital profile and service model exist', async () => {
  const doc = await read('docs/contracts/PLATFORM-OWNED-ORGANIZATION-OFFICIAL-PROFILE-CONTRACT.md');

  assert.match(doc, /Khedmah Digital Platform/);
  assert.match(doc, /Platform-Owned Organization/);
  assert.match(doc, /Official Business Profile/);
  assert.match(doc, /Khedmah Digital/);
  assert.match(doc, /خدمة ديجتل/);
  assert.match(doc, /Digital business development/);
  assert.match(doc, /Platform development/);
  assert.match(doc, /Application development/);
  assert.match(doc, /Software solutions/);
  assert.match(doc, /Digital transformation/);
  assert.match(doc, /Technical consulting/);
  assert.match(doc, /Business digitization/);
});

test('verification, discovery neutrality, trust, sharing, and analytics rules exist', async () => {
  const doc = await read('docs/contracts/PLATFORM-OWNED-ORGANIZATION-OFFICIAL-PROFILE-CONTRACT.md');

  assert.match(doc, /Official Platform Verification/);
  assert.match(doc, /Ownership confirmed/);
  assert.match(doc, /Managed by platform/);
  assert.match(doc, /Discovery Neutrality Rules/);
  assert.match(doc, /automatic top ranking/);
  assert.match(doc, /paid visibility/);
  assert.match(doc, /hidden preference/);
  assert.match(doc, /Trust Foundation Compatibility/);
  assert.match(doc, /Platform-Owned Organization\n↓\nVerification Status\n↓\nTrust Level/);
  assert.match(doc, /☂️ أنا مع خدمة 💙/);
  assert.match(doc, /Analytics Compatibility/);
  assert.match(doc, /profile views/);
  assert.match(doc, /service interest/);
  assert.match(doc, /competitor suppression/);
});

test('kill-critical review, security, and V1 boundaries are preserved', async () => {
  const doc = await read('docs/contracts/PLATFORM-OWNED-ORGANIZATION-OFFICIAL-PROFILE-CONTRACT.md');

  assert.match(doc, /KILL CRITICAL/);
  assert.match(doc, /Platform favoritism/);
  assert.match(doc, /Trust abuse/);
  assert.match(doc, /Ranking abuse/);
  assert.match(doc, /Advertising drift/);
  assert.match(doc, /Marketplace drift/);
  assert.match(doc, /Conflict of interest/);
  assert.match(doc, /No secrets/);
  assert.match(doc, /No credentials/);
  assert.match(doc, /No tokens/);
  assert.match(doc, /No passwords/);
  assert.match(doc, /No private user data/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /APIs/);
  assert.match(doc, /Database models/);
  assert.match(doc, /Migrations/);
  assert.match(doc, /UI screens/);
  assert.match(doc, /Verification workflows/);
  assert.match(doc, /Ranking systems/);
  assert.match(doc, /Advertising systems/);
  assert.match(doc, /Marketplace features/);
});

test('RTL Arabic direction remains preserved for platform profile readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
