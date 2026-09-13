import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('home classifieds strip uses only the independent classifieds API with no product fallback', async () => {
  const home = await read('app/page.tsx');
  const feed = await read('app/components/recently-added.tsx');

  assert.match(home, /<RecentlyAdded \/>/);
  assert.match(feed, /classifiedsApi\.list\(\{\}\)/);
  assert.match(feed, /items\.slice\(0, 8\)/);
  assert.match(feed, /الإعلانات المبوبة/);
  assert.match(feed, /href="\/classifieds"/);
  assert.doesNotMatch(feed, /api\.products|\/store\/products|\/store\/sell/);
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
  assert.match(page, /setActiveView\('list'\)/);
  assert.match(page, /إعادة تشغيل الخريطة/);
  assert.match(page, /تعذر تشغيل الخريطة/);
  assert.match(page, /عرض النتائج/);
});

function assertControlledMapScript(page: string) {
  const binding = 'window.initKhedmahMap = initialize;';
  const callback = page.indexOf(binding);
  const insertion = page.indexOf('document.head.appendChild(insertedScript)');
  assert.equal(page.split(binding).length - 1, 1, 'exactly one owned callback registration');
  assert.ok(callback >= 0 && insertion > callback, 'register callback before network loading');
  assert.match(page, /const initialize = \(\) => \{\s*if \(cancelled\) return;\s*try \{ initializeMapRef\.current\(\); \}\s*catch \{ failMap\(/);
  assert.match(page, /if \(window\.initKhedmahMap === initialize\) window\.initKhedmahMap = previousInitializer;/);
  assert.match(page, /if \(window\.gm_authFailure === authFailure\) window\.gm_authFailure = previousAuthFailure;/);
  assert.match(page, /MAP_SCRIPT_ID = 'khedmah-google-maps'/);
  assert.match(page, /callback=initKhedmahMap/);
  assert.match(page, /data-map-status=\{mapStatus\}/);
  assert.doesNotMatch(page, /from 'next\/script'/);
}

test('map installs the Google callback before inserting one controlled script', async () => {
  assertControlledMapScript(await read('app/map/page.tsx'));
});

for (const [name, mutate] of [
  ['missing registration', (page: string) => page.replace('window.initKhedmahMap = initialize;', '')],
  ['late registration', (page: string) => page.replace('window.initKhedmahMap = initialize;', '').replace('document.head.appendChild(insertedScript);', 'document.head.appendChild(insertedScript); window.initKhedmahMap = initialize;')],
  ['unguarded cleanup', (page: string) => page.replace('if (window.initKhedmahMap === initialize) ', '')],
  ['unguarded stale callback', (page: string) => page.replace('const initialize = () => {\n      if (cancelled) return;', 'const initialize = () => {')]
] as const) {
  test(`map callback contract rejects ${name}`, async () => {
    const page = await read('app/map/page.tsx');
    const broken = mutate(page);
    assert.notEqual(broken, page, 'mutation must change the actual source');
    assert.throws(() => assertControlledMapScript(broken));
  });
}

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
  assert.match(home, /\.heroCopy[\s\S]*backdrop-filter:blur\(18px\) saturate\(112%\)/);
  assert.match(home, /\.heroCopy::before[\s\S]*opacity:\.9/);
  assert.match(home, /linear-gradient\(135deg,#052f59 0%,#07427c 58%,#0b4f8e 100%\)/);
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