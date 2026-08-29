import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('taxi and delivery journey uses canonical categories and location-ranked search', async () => {
  const page = await read('app/mobility/page.tsx');
  assert.match(page, /type === 'taxi' \? 'taxi' : 'delivery_courier'/);
  assert.match(page, /api\.search\.query/);
  assert.match(page, /categoryCode: categoryFor\(type\)/);
  assert.match(page, /latitude: pickupCoordinates\.latitude/);
  assert.match(page, /longitude: pickupCoordinates\.longitude/);
  assert.match(page, /result\.businesses\.slice\(0, 12\)/);
  assert.match(page, /لا توجد رحلة مؤكدة قبل قبول المزود/);
});

test('mobility journey connects Google Places, geolocation and Google Maps directions', async () => {
  const [page, map, navigation, home] = await Promise.all([
    read('app/mobility/page.tsx'),
    read('app/map/page.tsx'),
    read('app/auth-navigation.tsx'),
    read('app/page.tsx')
  ]);
  assert.match(page, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(page, /libraries=places/);
  assert.match(page, /places\.Autocomplete/);
  assert.match(page, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(page, /https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(page, /travelmode/);
  assert.match(map, /libraries=places/);
  assert.match(navigation, /href: '\/mobility'/);
  assert.match(home, /href="\/mobility"/);
});
