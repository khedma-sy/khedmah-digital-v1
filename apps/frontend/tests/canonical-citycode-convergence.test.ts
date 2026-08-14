import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalCityCode, cityLabel } from '../lib/use-syrian-cities';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const cities = [
  { code: 'damascus', nameAr: 'دمشق', nameEn: 'Damascus', countryCode: 'SY' },
  { code: 'beirut', nameAr: 'بيروت', nameEn: 'Beirut', countryCode: 'LB' }
];

test('Locations API projection is filtered to Syria and unknown URL values stay invalid', async () => {
  const hook = await read('../lib/use-syrian-cities.ts');
  assert.match(hook, /api\.locations\.cities\(\)/);
  assert.match(hook, /city\.countryCode === 'SY'/);
  assert.doesNotMatch(hook, /damascus|aleppo|homs/);
  assert.equal(canonicalCityCode('damascus', cities), 'damascus');
  assert.equal(canonicalCityCode('beirut', cities), '');
  assert.equal(canonicalCityCode('invented', cities), '');
  assert.equal(cityLabel('damascus', cities), 'دمشق');
});

test('global and Professional search restore and emit only cityCode URL state', async () => {
  const [globalSearch, professional] = await Promise.all([
    read('../app/search/page.tsx'), read('../app/professional-profiles/search/page.tsx')
  ]);
  for (const source of [globalSearch, professional]) {
    assert.match(source, /params\.get\('cityCode'\)/);
    assert.match(source, /next\.set\('cityCode'/);
    assert.match(source, /setPage\(1\)/);
    assert.match(source, /next\.delete|new URLSearchParams|router\.replace/);
    assert.doesNotMatch(source, /const CITIES|[?&]location=|params\.get\('location'\)/);
  }
});

test('clear removes cityCode and Locations failures never install a static fallback', async () => {
  const [globalSearch, professional, hook] = await Promise.all([
    read('../app/search/page.tsx'), read('../app/professional-profiles/search/page.tsx'), read('../lib/use-syrian-cities.ts')
  ]);
  assert.match(globalSearch, /router\.replace\('\/search'\)/);
  assert.match(professional, /router\.replace\('\/professional-profiles\/search'\)/);
  assert.match(hook, /setCities\(\[\]\)/);
  assert.match(hook, /إعادة المحاولة|تعذر تحميل المدن/);
});

test('active selectors use shared Locations client without local city arrays', async () => {
  const paths = [
    '../app/search/page.tsx', '../app/professional-profiles/search/page.tsx',
    '../app/business-profiles/new/page.tsx', '../app/professional-profiles/new/page.tsx'
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /useSyrianCities/);
    assert.doesNotMatch(source, /const CITIES|<option value="damascus"/);
  }
});

test('governorate discovery links emit cityCode and never resurrect location alias', async () => {
  const page = await read('../app/locations/[slug]/page.tsx');
  assert.match(page, /name="cityCode"/);
  assert.match(page, /search\?cityCode=/);
  assert.doesNotMatch(page, /name="location"|search\?location=/);
});
