import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobility journey creates a bounded real request without pretending to price or track', async () => {
  const [page, client, provider] = await Promise.all([read('app/mobility/page.tsx'), read('lib/api-client.ts'), read('app/mobility/manage/page.tsx')]);
  assert.match(page, /type === 'taxi' \? 'taxi' : 'delivery_courier'/);
  assert.match(page, /get\('type'\) === 'delivery'/);
  assert.match(page, /categoryCode: categoryFor\(type\)/);
  assert.match(page, /latitude: resolvedPickup\.latitude/);
  assert.match(page, /longitude: resolvedPickup\.longitude/);
  assert.match(page, /result\.businesses\.slice\(0, 12\)/);
  assert.match(page, /api\.mobility\.create/);
  assert.match(page, /التسجيل والاستخدام مجانيان خلال المرحلة التجريبية/);
  assert.match(page, /لا يوجد بعد تسعير آلي أو دفع أو تتبع حي/);
  assert.match(client, /Idempotency-Key/);
  assert.match(provider, /api\.mobility\.listForProvider/);
  assert.match(provider, /قبول الطلب/);
  assert.match(provider, /أنا في الطريق/);
  assert.match(provider, /إكمال الرحلة/);
  assert.doesNotMatch(page, /تم تعيين السائق|تم تأكيد الرحلة|سعر الرحلة/);
});

test('mobility journey renders a resilient two-point Google map and accepts typed addresses', async () => {
  const page = await read('app/mobility/page.tsx');
  assert.match(page, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(page, /libraries=places/);
  assert.match(page, /new maps\.Map/);
  assert.match(page, /new maps\.Marker/);
  assert.match(page, /new maps\.Polyline/);
  assert.match(page, /map\.current\.addListener\('click'/);
  assert.match(page, /geocodeAddress\(pickup\)/);
  assert.match(page, /geocodeAddress\(destination\)/);
  assert.match(page, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(page, /gm_authFailure/);
  assert.match(page, /https:\/\/www\.google\.com\/maps\/dir\//);
});

test('mobility journey has explicit loading, empty-data and recovery states', async () => {
  const page = await read('app/mobility/page.tsx');
  assert.match(page, /mapsStatus === 'error'/);
  assert.match(page, /الخدمة تعمل، لكن لا يوجد مزود معتمد منشور هنا/);
  assert.match(page, /لن نعرض سائقًا وهميًا/);
  assert.match(page, /SkeletonGrid/);
  assert.match(page, /توسيع البحث على الخريطة/);
});
