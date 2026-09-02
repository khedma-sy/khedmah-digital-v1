import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('discovery navigation uses clear product language and active-page semantics', async () => {
  const navigation = await read('apps/frontend/app/auth-navigation.tsx');
  for (const label of ['اكتشف', 'التصنيفات', 'بالقرب مني']) assert.match(navigation, new RegExp(label));
  assert.match(navigation, /aria-current=\{link\.active \? 'page'/);
  assert.doesNotMatch(navigation, />المواقع<|>الخدمات<|>الخريطة</);
});

test('welcome is a responsive brand surface without the legacy blue phone or static city list', async () => {
  const [page, styles] = await Promise.all([
    read('apps/frontend/app/welcome/page.tsx'),
    read('apps/frontend/app/welcome/welcome.module.css')
  ]);
  assert.match(page, /تحت مظلة واحدة/);
  assert.match(page, /BrandMark/);
  assert.match(page, /ActionButton/);
  assert.match(styles, /var\(--k-color-canvas\)/);
  assert.doesNotMatch(page, /أنا مع خدمة|map-phone|syria-map-welcome|const cities/);
});

test('legacy governorate routes converge on canonical data-backed search', async () => {
  const [route, map, data] = await Promise.all([
    read('apps/frontend/app/locations/[slug]/page.tsx'),
    read('apps/frontend/app/map/page.tsx'),
    read('apps/frontend/lib/platform-data.ts')
  ]);
  assert.match(route, /redirect\(`\/search\?cityCode=/);
  assert.match(map, /map: true/);
  assert.doesNotMatch(map, /SyriaMap|umbrella-canopy/);
  assert.doesNotMatch(data, /serviceCategories|provinceBySlug/);
});

test('retired visual layers cannot return as parallel homepage implementations', async () => {
  const [home, styles] = await Promise.all([
    read('apps/frontend/app/page.tsx'),
    read('apps/frontend/app/globals.css')
  ]);
  for (const retired of ['brand-hero.tsx', 'platform-cards.tsx', 'platform-action.tsx', 'syria-map.tsx']) {
    await assert.rejects(read(`apps/frontend/app/components/${retired}`));
  }
  await assert.rejects(read('apps/frontend/lib/brand-hero-image.ts'));
  assert.doesNotMatch(`${home}\n${styles}`, /BrandHero|SyriaMap|umbrella-canopy|live-map-panel|hero-brand-lockup/);
});

test('categories owns the canonical directory route and the old catalog redirects', async () => {
  const [navigation, categories, legacy, directory, sitemap] = await Promise.all([
    read('apps/frontend/app/auth-navigation.tsx'),
    read('apps/frontend/app/categories/page.tsx'),
    read('apps/frontend/app/service-catalog/page.tsx'),
    read('apps/frontend/app/components/category-directory.tsx'),
    read('apps/frontend/app/sitemap.ts')
  ]);
  assert.match(navigation, /href: '\/categories'/);
  assert.match(categories, /CategoryDirectory/);
  assert.match(legacy, /redirect\('\/categories'\)/);
  assert.match(directory, /params\.set\('category', categoryCode\)/);
  assert.match(directory, /`\/categories\?\$\{params\}`/);
  assert.match(sitemap, /\/categories/);
  assert.doesNotMatch(sitemap, /\/service-catalog/);
});
