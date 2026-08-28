import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('new in Khedmah is a real approved-business feed with no fixture content', async () => {
  const home = await read('app/page.tsx');
  const feed = await read('app/components/recently-added.tsx');

  assert.match(home, /<RecentlyAdded \/>/);
  assert.match(feed, /api\.businesses\.getRecentlyAdded\(\)/);
  assert.match(feed, /business\.moderationStatus === 'approved'/);
  assert.match(feed, /business\.trustStatus === 'approved'/);
  assert.match(feed, /source=whats-new/);
  assert.match(feed, /KNOWN_TEST_NAMES/);
  assert.doesNotMatch(feed, /setTimeout|Math\.random|localStorage/);
  assert.doesNotMatch(feed, /return null/);
  assert.match(feed, /بانتظار أول نشاط موثّق/);
  assert.match(feed, /تعذر تحميل الأنشطة الجديدة/);
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


test('map waits for the Google callback before constructing the live map', async () => {
  const page = await read('app/map/page.tsx');

  assert.match(page, /window\.initKhedmahMap = initializeMap/);
  assert.match(page, /callback=initKhedmahMap/);
  assert.doesNotMatch(page, /onLoad=\{initializeMap\}/);
});


test('public discovery surfaces keep compact rhythm and restrained brand glass borders', async () => {
  const home = await read('app/home.module.css');
  const primitives = await read('app/ui-primitives.css');
  const discovery = await read('app/discovery.module.css');

  assert.match(home, /padding: clamp\(3rem, 5vw, 4\.25rem\)/);
  assert.match(home, /overflow-x: clip/);
  assert.match(home, /\.discovery::before[\s\S]*umbrella-pattern\.svg/);
  assert.match(home, /\.trustGrid article[\s\S]*backdrop-filter:blur\(18px\)/);
  assert.match(home, /\.heroCopy[\s\S]*backdrop-filter:blur\(24px\) saturate\(116%\)/);
  assert.match(home, /\.heroCopy::before[\s\S]*linear-gradient\(90deg,#155a91,#16875f,#ee7c37\)/);
  assert.match(primitives, /linear-gradient\(115deg[\s\S]*border-box/);
  assert.match(discovery, /\.tabs[\s\S]*backdrop-filter:blur\(18px\)/);
  assert.match(discovery, /\.provider[\s\S]*linear-gradient\(115deg/);
});


test('homepage balances a single real category without inventing fixtures', async () => {
  const home = await read('app/home.module.css');

  assert.match(home, /\.categoryGrid[\s\S]*repeat\(auto-fit/);
  assert.match(home, /\.categoryCard:only-child[\s\S]*grid-template-columns/);
  assert.match(home, /@media \(max-width: 38rem\)[\s\S]*\.categoryCard:only-child[\s\S]*grid-template-columns:1fr/);
});
