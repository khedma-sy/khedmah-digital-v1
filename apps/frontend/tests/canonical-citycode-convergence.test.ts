import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalCityCode, cityLabel } from '../lib/use-syrian-cities';
import { readSearchState, searchHref } from '../lib/search-context';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const cities = [
  { code: 'damascus', nameAr: 'دمشق', nameEn: 'Damascus', countryCode: 'SY' },
  { code: 'beirut', nameAr: 'بيروت', nameEn: 'Beirut', countryCode: 'LB' }
];

// Guard the URLSearchParams instance and canonical key, not its local variable name.
function assertCanonicalCityWriter(source: string) {
  const builder = source.match(/\bconst\s+(\w+)\s*=\s*new URLSearchParams\(\);/);
  assert.ok(builder, 'search must create a URLSearchParams instance');
  const variable = builder[1];
  assert.match(source, new RegExp(`\\b${variable}\\.set\\('cityCode',\\s*\\w+\\.cityCode\\)`));
  assert.match(source, new RegExp(`router\\.replace\\(${variable}\\.size\\s*\\?`));
  assert.ok(source.includes('${' + variable + '}'), 'navigation must serialize the same query builder');
  assert.doesNotMatch(source, /\.set\(['"]location['"]/);
}

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
  for (const source of [professional]) {
    assert.match(source, /params\.get\('cityCode'\)/);
    assertCanonicalCityWriter(source);
    assert.match(source, /canonicalCityCode\(rawCity, cities\)/);
    assert.match(source, /setPage\(1\)/);
    assert.match(source, /next\.delete|new URLSearchParams|router\.replace/);
    assert.doesNotMatch(source, /const CITIES|[?&]location=|params\.get\('location'\)/);
  }
  // Global search now delegates reading/serialization to the tested shared context.
  assert.match(globalSearch, /readSearchState\(params\)/);
  assert.match(globalSearch, /canonicalCityCode\(rawCity, cities\)/);
  assert.match(globalSearch, /cityCode: appliedCity/);
  assert.doesNotMatch(globalSearch, /const CITIES|[?&]location=|params\.get\('location'\)/);
  const state = readSearchState(new URLSearchParams('q=repair&cityCode=damascus&category=plumbing&type=service&page=2'));
  const url = new URL(searchHref(state), 'https://fixture.example.test');
  assert.equal(state.cityCode, 'damascus');
  assert.equal(url.searchParams.get('cityCode'), 'damascus');
  assert.equal(url.searchParams.get('location'), null);
  assert.equal(url.searchParams.get('categoryCode'), 'plumbing');
  assert.equal(readSearchState(new URLSearchParams('location=damascus')).cityCode, '');
});

test('canonical city writer guard permits local renaming but rejects missing or aliased serialization', () => {
  const source = "const query = new URLSearchParams(); if (state.cityCode) query.set('cityCode', state.cityCode); router.replace(query.size ? `/search?${query}` : '/search');";
  assert.doesNotThrow(() => assertCanonicalCityWriter(source));
  assert.doesNotThrow(() => assertCanonicalCityWriter(source.replaceAll('query', 'searchParams')));
  assert.throws(() => assertCanonicalCityWriter(source.replace("query.set('cityCode', state.cityCode);", '')));
  assert.throws(() => assertCanonicalCityWriter(source.replace("'cityCode'", "'location'")));
  assert.throws(() => assertCanonicalCityWriter(source.replace("query.set('cityCode'", "other.set('cityCode'")));
  assert.throws(() => assertCanonicalCityWriter(source.replace('${query}', '${other}')));
});

test('clear removes cityCode and Locations failures never install a static fallback', async () => {
  const [globalSearch, professional, hook] = await Promise.all([
    read('../app/search/page.tsx'), read('../app/professional-profiles/search/page.tsx'), read('../lib/use-syrian-cities.ts')
  ]);
  assert.match(globalSearch, /router\.push\('\/search', \{ scroll: false \}\)/);
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
  const [legacyPage, map] = await Promise.all([
    read('../app/locations/[slug]/page.tsx'), read('../app/components/syria-map.tsx')
  ]);
  assert.match(legacyPage, /redirect\(`\/search\?cityCode=/);
  assert.match(map, /router\.push\(`\/search\?cityCode=/);
  assert.doesNotMatch(`${legacyPage}\n${map}`, /name="location"|search\?location=|serviceCategories/);
});
