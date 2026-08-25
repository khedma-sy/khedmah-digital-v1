import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android is a branded service app rather than a map-only activity', async () => {
  const activity = await read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt');
  for (const contract of ['Destination.Home', 'Destination.Search', 'Destination.Map', 'BrandHeader', 'SearchScreen', 'CategoryRow']) {
    assert.match(activity, new RegExp(contract.replace('.', '\\.')));
  }
  assert.match(activity, /تحت مظلة واحدة/);
  assert.match(activity, /LocalLayoutDirection provides LayoutDirection\.Rtl/);
});

test('Android public discovery uses the canonical backend contracts', async () => {
  const api = await read('apps/android/app/src/main/java/com/khedmah/digital/KhedmahApi.kt');
  const gradle = await read('apps/android/app/build.gradle.kts');
  assert.match(api, /\/api\/v1\/categories/);
  assert.match(api, /\/api\/v1\/search/);
  assert.match(api, /startsWith\("https:\/\/"\)/);
  assert.match(gradle, /KHEDMAH_API_BASE_URL/);
  assert.match(gradle, /material3/);
});

test('Android ships the approved multi-color umbrella vector', async () => {
  const vector = await read('apps/android/app/src/main/res/drawable/ic_khedmah_umbrella.xml');
  for (const color of ['#103452', '#16875F', '#EE7C37']) assert.match(vector, new RegExp(color));
});
