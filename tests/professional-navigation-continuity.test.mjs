import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('signed-in navigation exposes the professional workspace without removing existing account routes', async () => {
  const source = await read('apps/frontend/app/auth-navigation.tsx');
  assert.match(source, /href="\/professional-profiles">ملفي المهني/);
  assert.match(source, /href="\/business-profiles">أعمالي/);
  assert.match(source, /href="\/users\/me"/);
});

test('nearby discovery truthfully bridges to city-based professional search instead of pretending professionals are mapped', async () => {
  const source = await read('apps/frontend/app/map/page.tsx');
  assert.match(source, /type:\s*'business'/, 'map results remain bounded to providers with supported map coordinates');
  assert.match(source, /tab:\s*'professional'/);
  assert.match(source, /categoryCode:\s*''/);
  assert.match(source, /ابحث عن مهنيين في المدينة/);
});


test('account hub exposes professional ownership actions alongside the wider platform journeys', async () => {
  const source = await read('apps/frontend/app/users/me/page.tsx');
  assert.match(source, /href="\/professional-profiles">ملفي المهني/);
  assert.match(source, /href="\/professional-profiles\/new"[^>]*>إنشاء أو تعديل الملف المهني/);
  assert.match(source, /أدر ملفك المهني وخدماتك وإعلاناتك ومنتجاتك ومسارات التنقل/);
});


test('restaurant cart rejects malformed quantity changes and does not publish an unpersisted UI state', async () => {
  const [cart, page] = await Promise.all([
    read('apps/frontend/lib/restaurant-cart.ts'),
    read('apps/frontend/app/restaurants/[businessId]/page.tsx')
  ]);
  assert.match(cart, /item\.productId\.trim\(\)\.length > 0/);
  assert.match(cart, /!normalizedProductId \|\| !Number\.isInteger\(change\) \|\| change === 0/);
  assert.match(page, /writeRestaurantCart\(next\);\s*setCart\(next\)/s);
  assert.match(page, /تعذر حفظ السلة على هذا الجهاز/);
  assert.doesNotMatch(page, /setCart\(next\);\s*writeRestaurantCart\(next\)/s);
});


test('courier empty state keeps the user on the governed delivery-courier signup path', async () => {
  const source = await read('apps/frontend/app/orders/courier/page.tsx');
  assert.match(source, /href="\/business-profiles\/new\?categoryCode=delivery_courier">تسجيل مندوب/);
});
