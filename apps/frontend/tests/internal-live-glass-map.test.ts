import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('new in Khedmah is a real approved-business feed with no fixture content', async () => {
  const page = await read('app/new/page.tsx');
  const navigation = await read('app/auth-navigation.tsx');

  assert.match(page, /api\.businesses\.getRecentlyAdded\(\)/);
  assert.match(page, /business\.moderationStatus === 'approved'/);
  assert.match(page, /business\.trustStatus === 'approved'/);
  assert.match(page, /source=whats-new/);
  assert.match(page, /KNOWN_TEST_NAMES/);
  assert.doesNotMatch(page, /setTimeout|Math\.random|localStorage/);
  assert.match(navigation, /href: '\/new'/);
});

test('shared internal surfaces use the approved glass and umbrella system', async () => {
  const primitives = await read('app/ui-primitives.css');
  const discovery = await read('app/discovery.module.css');

  assert.match(primitives, /umbrella-pattern\.svg/);
  assert.match(primitives, /backdrop-filter:blur\(22px\)/);
  assert.match(discovery, /mapPanel[\s\S]*backdrop-filter:blur\(24px\)/);
});

test('map exposes a usable Arabic fallback when Google rejects the live origin', async () => {
  const page = await read('app/map/page.tsx');

  assert.match(page, /gm_authFailure/);
  assert.match(page, /onError=\{\(\) => setMapStatus\('error'\)\}/);
  assert.match(page, /تعذر تشغيل الخريطة/);
  assert.match(page, /عرض النتائج/);
});
