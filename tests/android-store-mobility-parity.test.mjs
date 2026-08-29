import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android exposes the moderated public store with complete product images', async () => {
  const [activity, api, screens] = await Promise.all([
    read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt'),
    read('apps/android/app/src/main/java/com/khedmah/digital/KhedmahApi.kt'),
    read('apps/android/app/src/main/java/com/khedmah/digital/MarketplaceScreens.kt')
  ]);
  assert.match(activity, /Destination\.Store/);
  assert.match(activity, /StoreScreen/);
  assert.match(api, /\/api\/v1\/products/);
  assert.match(api, /data class KhedmahProduct/);
  assert.match(screens, /متجر خدمة/);
  assert.match(screens, /ContentScale\.Fit/);
  assert.doesNotMatch(screens, /ContentScale\.Crop/);
});

test('Android taxi and delivery use current location, canonical search and Google directions', async () => {
  const [activity, api, screens] = await Promise.all([
    read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt'),
    read('apps/android/app/src/main/java/com/khedmah/digital/KhedmahApi.kt'),
    read('apps/android/app/src/main/java/com/khedmah/digital/MarketplaceScreens.kt')
  ]);
  assert.match(activity, /Destination\.Mobility/);
  assert.match(activity, /LocationManager\.GPS_PROVIDER/);
  assert.match(activity, /api\.search\("", category, location\.latitude, location\.longitude\)/);
  assert.match(api, /add\("map=true"\)/);
  assert.match(api, /add\("type=business"\)/);
  assert.match(screens, /delivery_courier/);
  assert.match(screens, /https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(screens, /Intent\.ACTION_DIAL/);
  assert.match(screens, /لا تُعد الرحلة مؤكدة/);
});
