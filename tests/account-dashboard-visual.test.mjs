import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('account dashboard has a clear Arabic-first visual hierarchy', async () => {
  const [page, styles] = await Promise.all([
    read('apps/frontend/app/users/me/page.tsx'),
    read('apps/frontend/app/ui-primitives.css'),
  ]);

  assert.match(page, /مرحبًا،/);
  assert.match(page, /تم تسجيل الدخول بأمان/);
  assert.match(page, /المسارات الأكثر استخدامًا/);
  assert.match(page, /البيع والطلبات/);
  assert.match(page, /النقل والتوصيل/);
  assert.match(page, /PlatformIcon/);
  assert.match(page, /KHEDMAH_FACEBOOK_URL/);
  assert.match(page, /KHEDMAH_WHATSAPP_CHANNEL_URL/);
  assert.match(page, /متابعة قناة واتساب/);
  assert.match(page, /الاتصال عبر واتساب/);
  assert.match(page, /رابط الاتصال قيد التحقق/);

  for (const route of [
    '/business-profiles',
    '/business-profiles/new',
    '/store/sell',
    '/store/manage',
    '/orders',
    '/orders/merchant',
    '/orders/courier',
    '/mobility',
    '/mobility/manage',
  ]) assert.match(page, new RegExp(route.replaceAll('/', '\\/')));

  assert.match(styles, /\.ui-account-hero/);
  assert.match(styles, /\.ui-account-featured-grid/);
  assert.match(styles, /\.ui-account-sections/);
  assert.match(styles, /\.ui-account-social/);
  assert.match(styles, /@media\(max-width:40rem\)/);
  assert.doesNotMatch(page, /ui-account-grid/);
});
