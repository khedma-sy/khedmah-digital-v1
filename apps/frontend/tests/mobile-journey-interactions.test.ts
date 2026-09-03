import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ordered welcome, home, and catalog journey has working navigation targets', async () => {
  const [welcome, home, catalog] = await Promise.all([
    read('app/welcome/page.tsx'),
    read('app/page.tsx'),
    read('app/components/category-directory.tsx')
  ]);

  assert.match(welcome, /onClick=\{completeOnboarding\}/);
  assert.match(home, /href="\/search"/);
  assert.match(home, /href="\/auth\/register"/);
  assert.match(catalog, /PageHeader eyebrow=.*title=\{title\}.*backHref=\{activeCategory \? '\/categories' : '\/'\}/s);
  assert.match(catalog, /onClick=\{\(\) => setShowFilters/);
  assert.match(catalog, /selectCategory\(category\.code\)/);
  assert.match(catalog, /transport: 'delivery'/);
  assert.match(catalog, /activeCategory && isLoading/);
  assert.match(catalog, /!activeCategory && categories\.length > 0/);
  assert.match(catalog, /providerHref\(service\)/);
  assert.match(catalog, /page: pageNumber/);
  assert.match(catalog, /setTotal\(data\.total\)/);
  assert.match(catalog, /aria-label="صفحات دليل الخدمات"/);
  assert.match(catalog, /loadServices\(activeCategory, page\)/);
});

test('password visibility icons are operable controls with accessible labels', async () => {
  const [login, register] = await Promise.all([
    read('app/auth/login/page.tsx'),
    read('app/auth/register/page.tsx')
  ]);

  assert.match(login, /className="password-toggle"/);
  assert.match(login, /aria-pressed=\{showPassword\}/);
  assert.match(register, /إظهار تأكيد كلمة المرور/);
  assert.equal((register.match(/className="password-toggle"/g) ?? []).length, 2);
});

test('all journey icons use the shared SVG icon system', async () => {
  const [home, catalog, icons] = await Promise.all([
    read('app/page.tsx'),
    read('app/components/category-directory.tsx'),
    read('app/components/platform-icon.tsx')
  ]);

  for (const icon of ['arrow', 'userPlus', 'filter']) assert.match(icons, new RegExp(`${icon}:`));
  assert.match(home, /PlatformIcon name="search"/);
  assert.match(home, /PlatformIcon name="briefcase"/);
  assert.match(catalog, /PlatformIcon name="filter"/);
});

test('catalog keeps specialties visible and empty results recoverable', async () => {
  const [catalog, icons, styles] = await Promise.all([
    read('app/components/category-directory.tsx'),
    read('app/components/platform-icon.tsx'),
    read('app/brand-system.css')
  ]);

  assert.match(catalog, /catalog-specialty-grid/);
  assert.match(catalog, /iconFor\(category\.visualKey\)/);
  assert.match(catalog, /توسيع البحث/);
  assert.match(catalog, /فتح الخريطة/);
  assert.match(catalog, /تخصصات قريبة/);
  assert.match(catalog, /سجّل كمقدم خدمة/);
  assert.doesNotMatch(catalog, /catalog-category-icon"><PlatformIcon name="tools"/);
  for (const icon of ['food', 'health', 'education', 'technology', 'travel']) assert.match(icons, new RegExp(`${icon}:`));
  assert.match(styles, /@media\(max-width:36rem\).*catalog-specialty-grid/s);
});

test('catalog uses the approved blue identity with a responsive RTL hierarchy', async () => {
  const [catalog, styles] = await Promise.all([
    read('app/components/category-directory.tsx'),
    read('app/brand-system.css')
  ]);

  assert.match(styles, /--catalog-blue:#07427c/);
  assert.match(styles, /catalog-category-grid \{ display:grid; grid-template-columns:repeat\(4/);
  assert.match(styles, /@media\(max-width:68rem\).*catalog-category-grid.*repeat\(3/s);
  assert.match(styles, /@media\(max-width:48rem\).*catalog-category-grid.*repeat\(2/s);
  assert.match(styles, /@media\(max-width:36rem\).*catalog-category-grid.*1fr/s);
  assert.match(styles, /catalog-experience \.ui-container \{ padding-block-end/);
  assert.match(catalog, /transport: 'delivery'/);
  assert.match(catalog, /بحث متقدم/);
  assert.match(catalog, /تغيير المجال/);
  assert.doesNotMatch(catalog, /> التصنيفات<\/ActionButton>/);
});
