import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('frontend centralizes governed Syrian city selection in Locations API', async () => {
  const hook = await read('apps/frontend/lib/use-syrian-cities.ts');
  assert.match(hook, /api\.locations\.cities/);
  assert.match(hook, /countryCode === 'SY'/);
});

test('API clients and backend discovery retain canonical cityCode while map geo remains separate', async () => {
  const [client, map] = await Promise.all([read('apps/frontend/lib/api-client.ts'), read('apps/frontend/app/map/page.tsx')]);
  assert.match(client, /qs\.set\('cityCode', params\.cityCode\)/);
  assert.match(map, /latitude|longitude|boundaries/);
  assert.doesNotMatch(map, /cityCode = latitude|cityCode = longitude/);
});
