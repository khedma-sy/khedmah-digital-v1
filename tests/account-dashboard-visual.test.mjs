import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('account dashboard has a clear Arabic-first visual hierarchy', async () => {
  const [page, priorityServices, styles] = await Promise.all([
    read('apps/frontend/app/users/me/page.tsx'),
    read('apps/frontend/app/components/priority-services.tsx'),
    read('apps/frontend/app/ui-primitives.css'),
  ]);

  assert.match(page, /مرحبًا،/);
  assert.match(page, /تم تسجيل الدخول بأمان/);
  assert.match(page, /PriorityServices/);
  assert.match(page, /إدارة نشاطك/);
  assert.match(page, /طلباتي ومهامي/);
  assert.match(page, /نشاط جارٍ الآن/);
  assert.match(page, /merchantCategories/);
  assert.match(page, /courierBusiness/);
  assert.match(page, /taxiBusiness/);
  assert.match(page, /roleLabels/);
  assert.match(page, /دور الحساب/);
  assert.doesNotMatch(page, /لست مسجلًا كسائق أو مندوب|أضف نشاط نقل/);
  assert.match(page, /PlatformIcon/);
  assert.doesNotMatch(page, /OfficialSocialLinks/);
  assert.doesNotMatch(page, /صفحاتنا على مواقع التواصل/);
  assert.doesNotMatch(page, /officialWhatsappContactUrl|ui-account-contact/);
  assert.match(page, /<bdi>\{firstName\}<\/bdi>/);
  assert.doesNotMatch(page, /متابعة قناة واتساب|الاتصال عبر واتساب|رابط الاتصال قيد التحقق/);

  for (const route of [
    '/business-profiles',
    '/business-profiles/new',
    '/store/sell',
    '/store/manage',
    '/orders',
    '/orders/merchant',
    '/orders/courier',
    '/mobility/manage',
  ]) assert.match(page, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  for (const route of ['/restaurants', '/mobility?type=delivery', '/mobility?type=taxi']) {
    assert.match(priorityServices, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const label of ['اطلب طعامًا', 'اطلب مندوب توصيل', 'ابدأ الرحلة', 'خدمة تكسي']) assert.match(priorityServices, new RegExp(label));

  assert.ok(page.indexOf('<PriorityServices />') < page.indexOf('<Surface className="ui-account-hero">'));

  assert.match(styles, /\.ui-account-hero/);
  assert.match(styles, /\.ui-priority-services-grid/);
  assert.match(styles, /\.ui-account-sections/);
  assert.match(styles, /\.ui-account-active/);
  assert.match(styles, /\.ui-account-shortcut-success/);
  assert.match(styles, /\.ui-account-shortcut-accent/);
  assert.match(styles, /\.ui-account-shortcut-violet/);
  assert.match(styles, /body:has\(\.ui-account-page\) \.smart-assistant-trigger/);
  assert.doesNotMatch(styles, /\.ui-account-social/);
  assert.match(styles, /@media\(max-width:40rem\)/);
  assert.doesNotMatch(page, /ui-account-grid/);
});
