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

test('categories render all three canonical semantic brand tones', () => {
  const css = read('../app/categories/categories.module.css');
  for (const [tone, token, text] of [
    ['navy', '--brand-navy', '--k-text-on-primary'],
    ['green', '--brand-green', '--k-text-on-green'],
    ['orange', '--brand-orange', '--k-text-on-orange'],
  ] as const) {
    assert.match(css, new RegExp(`data-category-tone='${tone}'`));
    assert.ok(css.includes(`background: var(${token})`));
    assert.ok(css.includes(`color: var(${text})`));
  }
  assert.match(read('../app/categories/page.tsx'), /styles\.toneScope/);
});

test('classifieds and taxi inherit canonical brand/theme tokens', () => {
  const classifieds = read('../app/classifieds/classifieds.module.css');
  const taxi = read('../app/taxi/taxi.module.css');
  assert.match(classifieds, /--brand-orange,#fd9603/);
  assert.doesNotMatch(classifieds, /#e97835/i);
  assert.match(taxi, /--taxi-navy:var\(--k-color-primary\)/);
  assert.match(taxi, /--taxi-green:var\(--brand-green\)/);
  assert.match(taxi, /var\(--k-color-surface-muted\),var\(--k-color-canvas\)/);
  assert.doesNotMatch(taxi, /#8fc0ee|#dfe9f1|#eef3f6/i);
});

test('restaurant discovery survives partial category failures', () => {
  const source = read('../app/restaurants/page.tsx');
  assert.match(source, /Promise\.allSettled\(/);
  assert.match(source, /fulfilled\.length/);
  assert.match(source, /rejected\.length/);
  assert.match(source, /تم تحميل المطاعم المتاحة/);
  assert.doesNotMatch(source, /Promise\.all\(\s*FOOD_CATEGORIES/);
});
