import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script } from 'node:vm';

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

test('courier registration preserves its category through both expired-session paths and taxonomy retries', async () => {
  const source = await read('apps/frontend/app/business-profiles/new/page.tsx');
  const start = source.indexOf('const deliveryEntry = ');
  const end = source.indexOf('\n\nexport default function', start);
  assert.ok(start >= 0 && end > start, 'the bounded courier login helper must exist');
  const helper = new Script(source.slice(start, end) + '\n signupLoginHref()');
  const loginHrefFor = (search) => helper.runInContext(createContext({ window: { location: { search } } }));
  assert.equal(loginHrefFor('?categoryCode=delivery_courier'), '/auth/login?next=%2Fbusiness-profiles%2Fnew%3FcategoryCode%3Ddelivery_courier');
  assert.equal(loginHrefFor('?categoryCode=restaurant'), '/auth/login?next=%2Fbusiness-profiles%2Fnew');
  assert.equal((source.match(/router\.replace\(signupLoginHref\(\)\)/g) ?? []).length, 2,
    'both initial session verification and the submit-time expired session must preserve the courier entry');
  assert.match(source, /if \(categoriesLoading \|\| categoriesError \|\| categoryPrefilled\.current\) return;/);
  assert.match(source, /if \(!categories\.some\(category => category\.code === requested\)\) return;/);
  assert.match(source, /\}, \[categories, categoriesLoading, categoriesError\]\);/,
    'a successful retry must be able to preselect delivery_courier after a taxonomy error');
});
