import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobility journey creates a governed request with platform fare and honest tracking boundaries', async () => {
  const [page, client, provider] = await Promise.all([read('app/mobility/page.tsx'), read('lib/api-client.ts'), read('app/mobility/manage/page.tsx')]);
  assert.match(page, /type === 'taxi' \? 'taxi' : 'delivery_courier'/);
  assert.match(page, /get\('type'\) === 'delivery'/);
  assert.match(page, /categoryCode: categoryFor\(type\)/);
  assert.match(page, /latitude: resolvedPickup\.latitude/);
  assert.match(page, /longitude: resolvedPickup\.longitude/);
  assert.match(page, /result\.businesses\.slice\(0, 12\)/);
  assert.match(page, /api\.mobility\.create/);
  assert.match(page, /title=\{type === 'taxi' \? 'ابدأ الرحلة'/);
  assert.match(page, /خدمة تكسي/);
  assert.match(page, /قُبل طلب رحلة خدمة/);
  assert.match(page, /سائق خدمة في الطريق/);
  assert.match(page, /السعر تحسبه خدمة بعد الرحلة/);
  assert.match(page, /الدفع الإلكتروني والتتبع في الخلفية غير مفعّلين بعد/);
  assert.match(client, /Idempotency-Key/);
  assert.doesNotMatch(client, /distanceMeters/);
  assert.match(provider, /api\.mobility\.listForProvider/);
  assert.match(provider, /قبول/);
  assert.match(provider, /انطلقت للعميل/);
  assert.match(provider, /وصلت إلى العميل/);
  assert.match(provider, /ابدأ الرحلة والعداد/);
  assert.match(provider, /إنهاء وإصدار السعر/);
  assert.doesNotMatch(provider, /name=["']finalFare/);
  assert.doesNotMatch(provider, /watchPosition|khedmah-distance-/);
  assert.match(provider, /تحسب خدمة المسافة والسعر من الخادم/);
  assert.match(provider, /playOrderRing/);
  assert.match(provider, /requestOrderNotifications/);
  assert.match(provider, /showOrderNotification/);
  assert.match(provider, /setInterval/);
});

test('mobility journey renders a resilient two-point Google map and accepts typed addresses', async () => {
  const [page, styles, promotionStyles] = await Promise.all([read('app/mobility/page.tsx'), read('app/mobility/mobility.module.css'), read('app/mobility/mobility-promotion.module.css')]);
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
  assert.match(page, /\^khedmah-pr-/);
  assert.match(page, /الخريطة التفاعلية غير متاحة في نطاق المعاينة/);
  assert.match(page, /strokeColor: '#81BE49'/);
  assert.match(styles, /--mobility-green:\s*#81be49/i);
  assert.match(styles, /--mobility-font-arabic/);
  assert.match(styles, /font-weight:\s*500/);
  assert.match(styles, /font-weight:\s*700/);
  assert.match(styles, /font-weight:\s*800/);
  assert.match(promotionStyles, /--mobility-green-deep/);
});

test('mobility journey has explicit loading, empty-data and recovery states', async () => {
  const page = await read('app/mobility/page.tsx');
  assert.match(page, /mapsStatus === 'error'/);
  assert.match(page, /الخدمة تعمل، لكن لا يوجد مزود معتمد منشور هنا/);
  assert.match(page, /لن نعرض سائقًا وهميًا/);
  assert.match(page, /SkeletonGrid/);
  assert.match(page, /توسيع البحث على الخريطة/);
});
