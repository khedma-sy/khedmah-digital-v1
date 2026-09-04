import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('home classifieds strip uses only the moderated product API with no fixture content', async () => {
  const home = await read('app/page.tsx');
  const feed = await read('app/components/recently-added.tsx');

  assert.match(home, /<RecentlyAdded \/>/);
  assert.match(feed, /api\.products\.list\(\{\}\)/);
  assert.match(feed, /products\.slice\(0, 8\)/);
  assert.match(feed, /الإعلانات المبوبة/);
  assert.match(feed, /href="\/classifieds"/);
  assert.doesNotMatch(feed, /setTimeout|Math\.random|localStorage/);
  assert.doesNotMatch(feed, /return null/);
  assert.match(feed, /لا توجد إعلانات منشورة حاليًا/);
  assert.doesNotMatch(feed, /بانتظار أول نشاط موثّق/);
  assert.match(feed, /تعذر تحميل الإعلانات/);
});

test('shared internal surfaces use approved glass without decorative umbrella backgrounds', async () => {
  const primitives = await read('app/ui-primitives.css');
  const discovery = await read('app/discovery.module.css');

  assert.doesNotMatch(primitives, /umbrella-pattern\.svg/);
  assert.doesNotMatch(discovery, /umbrella-pattern\.svg/);
  assert.match(primitives, /backdrop-filter:blur\(var\(--k-glass-blur\)\)/);
  assert.match(discovery, /mapPanel[\s\S]*backdrop-filter:blur\(24px\)/);
});

test('map exposes a usable Arabic fallback when Google rejects the live origin', async () => {
  const page = await read('app/map/page.tsx');

  assert.match(page, /gm_authFailure/);
  assert.match(page, /\^khedmah-pr-\\d\+-frontend-/);
  assert.match(page, /الخريطة التفاعلية غير متاحة في نطاق المعاينة/);
  assert.match(page, /setActiveView\('list'\)/);
  assert.match(page, /إعادة تشغيل الخريطة/);
  assert.match(page, /تعذر تشغيل الخريطة/);
  assert.match(page, /عرض النتائج/);
});


test('map installs the Google callback before inserting one controlled script', async () => {
  const page = await read('app/map/page.tsx');

  const callback = page.indexOf('window.initKhedmahMap = () =>');
  const insertion = page.indexOf('document.head.appendChild(insertedScript)');
  assert.ok(callback >= 0 && insertion > callback);
  assert.match(page, /MAP_SCRIPT_ID = 'khedmah-google-maps'/);
  assert.match(page, /callback=initKhedmahMap/);
  assert.match(page, /data-map-status=\{mapStatus\}/);
  assert.doesNotMatch(page, /from 'next\/script'/);
});


test('public discovery surfaces keep compact rhythm and restrained brand glass borders', async () => {
  const home = await read('app/home.module.css');
  const primitives = await read('app/ui-primitives.css');
  const discovery = await read('app/discovery.module.css');

  assert.match(home, /padding:clamp\(2\.5rem,4vw,3\.5rem\)/);
  assert.match(home, /overflow-x:clip/);
  assert.match(home, /font-size:var\(--k-type-display\)/);
  assert.match(home, /aspect-ratio:1200\/804/);
  assert.doesNotMatch(home, /umbrella-pattern\.svg/);
  assert.match(home, /\.trustGrid article[\s\S]*backdrop-filter:blur\(var\(--k-glass-blur\)\)/);
  assert.match(home, /\.heroCopy[\s\S]*backdrop-filter:blur\(var\(--k-glass-blur\)\) saturate\(108%\)/);
  assert.match(home, /\.heroCopy::before[\s\S]*opacity:\.7/);
  assert.match(primitives, /background:var\(--k-glass\)/);
  assert.match(discovery, /\.tabs[\s\S]*backdrop-filter:blur\(18px\)/);
  assert.match(discovery, /\.provider[\s\S]*linear-gradient\(115deg/);
});


test('homepage keeps every real category in the same complete-image grid', async () => {
  const home = await read('app/home.module.css');

  assert.match(home, /\.categoryGrid[\s\S]*repeat\(auto-fit/);
  assert.match(home, /\.categoryImage[\s\S]*aspect-ratio:4\/3/);
  assert.match(home, /\.categoryImage img[\s\S]*object-fit:contain/);
  assert.doesNotMatch(home, /categoryCard:only-child/);
});
