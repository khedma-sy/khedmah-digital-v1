import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const ownerPages = [
  'apps/frontend/app/business-profiles/page.tsx',
  'apps/frontend/app/business-profiles/new/page.tsx',
  'apps/frontend/app/professional-profiles/new/page.tsx'
];

test('owner workspace pages use shared identity primitives and no legacy branding', async () => {
  const pages = await Promise.all(ownerPages.map(read));
  for (const page of pages) {
    assert.match(page, /PageShell/);
    assert.match(page, /PageHeader/);
    assert.match(page, /owner-workspace\.module\.css/);
    assert.doesNotMatch(page, /خدمة الرقمية|identity-shell|identity-card|foundation-action|style=\{|🏢|📞|✉|⏳|✗/);
  }
});

test('business creation is a private reviewed workflow using canonical Syrian cities and categories', async () => {
  const page = await read('apps/frontend/app/business-profiles/new/page.tsx');
  assert.match(page, /api\.businesses\.create/);
  assert.match(page, /useSyrianCities/);
  assert.match(page, /useCategories/);
  assert.match(page, /countryCode: 'SY'/);
  assert.match(page, /ملف خاص/);
  assert.match(page, /قرار النشر النهائي بشري/);
  assert.match(page, /api\.auth\.session\(\)/);
  assert.match(page, /isCheckingSession/);
  assert.match(page, /\/auth\/login\?next=%2Fbusiness-profiles%2Fnew/);
  assert.doesNotMatch(page, /api\.locations\.countries|Saudi Arabia|UAE/);
});

test('login returns safely to the protected owner destination', async () => {
  const login = await read('apps/frontend/app/auth/login/page.tsx');
  assert.match(login, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(login, /new URL\(requestedDestination, window\.location\.origin\)/);
  assert.match(login, /parsedDestination\.origin !== window\.location\.origin/);
  assert.match(login, /parsedDestination\.pathname/);
  assert.match(login, /router\.push\(destination\)/);
});

test('owner can edit real business data and manage services and inquiries', async () => {
  const page = await read('apps/frontend/app/business-profiles/[id]/manage/page.tsx');
  assert.match(page, /api\.businesses\.update/);
  assert.match(page, /api\.services\.create/);
  assert.match(page, /api\.services\.update/);
  assert.match(page, /api\.businesses\.listReceivedInquiries/);
  assert.doesNotMatch(page, /setTimeout|Math\.random|localStorage/);
});

test('professional editor prefills and persists the authenticated professional profile', async () => {
  const page = await read('apps/frontend/app/professional-profiles/new/page.tsx');
  assert.match(page, /api\.professionals\.getMine/);
  assert.match(page, /api\.professionals\.createOrUpdate/);
  assert.match(page, /router\.push\(`\/professional-profiles\/\$\{result\.professional\.id\}`\)/);
  assert.match(page, /useSyrianCities/);
  assert.doesNotMatch(page, /style=\{|خدمة الرقمية/);
});

test('shared owner workspace is responsive and token driven', async () => {
  const css = await read('apps/frontend/components/owner-workspace.module.css');
  for (const token of ['--k-color-canvas', '--k-color-surface', '--k-color-text', '--k-color-primary', '--k-color-accent']) assert.match(css, new RegExp(token));
  assert.match(css, /@media\(max-width:52rem\)/);
  assert.match(css, /@media\(max-width:38rem\)/);
  assert.doesNotMatch(css, /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i);
});
