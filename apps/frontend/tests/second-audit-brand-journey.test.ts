import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('home hero follows launch priority food then delivery then taxi', () => {
  const source = read('../app/page.tsx');
  const actions = source.match(/<div className=\{styles\.actions\}>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const hrefs = [...actions.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ['/food', '/mobility?type=delivery', '/taxi']);
  assert.doesNotMatch(actions, /href="\/store"/);
});

test('categories retain all three canonical semantic Khedmah icon tones', () => {
  const css = read('../app/categories/categories.module.css');
  for (const [tone, token, text] of [
    ['navy', '--brand-navy', '#fff'],
    ['green', '--brand-green', 'var(--k-color-on-accent)'],
    ['orange', '--brand-orange', 'var(--k-color-on-accent)'],
  ] as const) {
    assert.match(css, new RegExp(`data-category-tone='${tone}'`));
    assert.ok(css.includes(`background: var(${token})`));
    assert.ok(css.includes(`color: ${text}`));
  }
  assert.match(read('../app/categories/page.tsx'), /styles\.toneScope/);
});

test('near-me map uses the canonical Khedmah green for service radii', () => {
  const map = read('../app/map/page.tsx');
  assert.match(map, /fillColor: '#81be49'/);
  assert.match(map, /strokeColor: '#81be49'/);
  assert.doesNotMatch(map, /#7fc63b/i);
});

test('editorial marketplace and nearby pages use neutral Ali & Sons-inspired surfaces', () => {
  const categories = read('../app/categories/categories.module.css');
  const store = read('../app/store/store.module.css');
  const classifieds = read('../app/classifieds/classifieds.module.css');
  const nearby = read('../app/discovery.module.css');
  for (const css of [categories, store, classifieds]) {
    assert.match(css, /#101820/);
    assert.match(css, /#f4f4f4/);
    assert.match(css, /#ddd/);
  }
  assert.match(nearby, /\.mapPage\s*\{\s*background:\s*#f4f4f4/);
  assert.match(nearby, /\.mapBrand\s*\{\s*color:\s*#101820/);
});

test('taxi uses a warm Talabat-style frame with the requested yellow primary', () => {
  const taxi = read('../app/taxi/taxi.module.css');
  assert.match(taxi, /--taxi-yellow:#f2c230/);
  assert.match(taxi, /background: #f2c230/);
  assert.match(taxi, /color: #262626/);
  assert.match(taxi, /background:#f4ede3/);
  assert.match(taxi, /--taxi-green:var\\(--brand-green\\)/);
});

test('restaurant discovery survives partial category failures', () => {
  const source = read('../app/restaurants/page.tsx');
  assert.match(source, /Promise\.allSettled\(/);
  assert.match(source, /fulfilled\.length/);
  assert.match(source, /rejected\.length/);
  assert.match(source, /setPartialFailure\(rejected\.length > 0\)/);
  assert.match(source, /تم تحميل نتائج جزئية\. أعد محاولة الصفحة الحالية قبل متابعة بقية المطاعم\./);
  assert.match(source, /إعادة تحميل الصفحة الحالية/);
  assert.doesNotMatch(source, /Promise\.all\(\s*FOOD_CATEGORIES/);
});
