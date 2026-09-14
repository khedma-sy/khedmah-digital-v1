import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('courier help is explicit and keeps order and independent delivery boundaries separate', () => {
  const bridge = read('../app/components/delivery-help.tsx');
  const checkout = read('../app/orders/checkout/page.tsx');
  const menu = read('../app/restaurants/[businessId]/page.tsx');
  const ad = read('../app/classifieds/[id]/page.tsx');
  const mobility = read('../app/mobility/page.tsx');

  assert.match(bridge, /هل تحتاج مندوب توصيل؟/);
  assert.match(bridge, /\/mobility\?type=delivery/);
  assert.match(bridge, /لا ينشئ دفعة أو طلب شراء داخل الإعلانات/);
  assert.match(checkout, /<DeliveryHelp mode="order" \/>/);
  assert.match(menu, /<DeliveryHelp mode="order" \/>/);
  assert.match(ad, /const mayNeedDelivery = ad\.kind === 'sale' \|\| ad\.kind === 'rent'/);
  assert.match(ad, /mayNeedDelivery && <DeliveryHelp mode="independent" \/>/);
  assert.match(mobility, /title=\{deliveryMode \? 'هل تحتاج مندوب توصيل؟'/);
  assert.match(mobility, /categoryFor = \(type: 'taxi' \| 'delivery'\) => type === 'taxi' \? 'taxi' : 'delivery_courier'/);
});

test('classifieds pagination is server owned from validation to URL navigation', () => {
  const client = read('../lib/classifieds-client.ts');
  const page = read('../app/classifieds/page.tsx');

  assert.match(client, /CLASSIFIEDS_PAGE_SIZE = 20/);
  assert.match(client, /page\?: number/);
  assert.match(client, /ads: PublicAdListing\[\]; total: number; page: number/);
  assert.match(page, /parsePage\(params\.get\('page'\)\)/);
  assert.match(page, /page \* CLASSIFIEDS_PAGE_SIZE < total/);
  assert.match(page, /عرض \{firstResult/);
  assert.match(page, /goToPage\(page - 1\)/);
  assert.match(page, /goToPage\(page \+ 1\)/);
  assert.match(page, /syncUrl\(filters, 1\)/);
});

test('taxi keeps driver onboarding visible and exposes rating only after completed trips', () => {
  const page = read('../app/taxi/page.tsx');
  const layout = read('../app/taxi/layout.tsx');

  assert.match(page, /href="\/taxi-driver-signup"/);
  assert.match(page, /taxiApi\.rider\.command\(trip\.id, 'rate', trip\.version, \{ rating \}\)/);
  assert.match(page, /trip\.phase === 'completed'/);
  assert.match(page, /trip\.rating !== undefined/);
  assert.match(page, /\[1, 2, 3, 4, 5\]\.map/);
  assert.match(page, /الوصول وإنهاء الرحلة يعتمدان على إثباتات تشغيلية موثوقة/);
  assert.doesNotMatch(page, /action:\s*['"](?:arrive|finish_ride|complete_ride)['"]/);

  assert.match(layout, /process\.env\.TAXI_TRIPS_ENABLED === 'true'/);
  assert.match(layout, /data-khedmah-section="taxi">\{children\}<\/div>/);
  assert.match(layout, /href="\/taxi-driver-signup"/);
});
