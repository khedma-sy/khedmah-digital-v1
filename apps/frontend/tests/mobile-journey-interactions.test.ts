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
  assert.match(home, /<form action="\/search"/);
  assert.match(home, /href: '\/food'/);
  assert.match(home, /href: '\/mobility\?type=delivery'/);
  assert.match(home, /href: '\/taxi'/);
  assert.match(home, /href="\/store"/);
  assert.match(home, /href="\/auth\/register"/);
  assert.match(catalog, /PageHeader title=\{title\}.*backHref="\/"/s);
  assert.match(catalog, /onClick=\{\(\) => setShowFilters/);
  assert.match(catalog, /selectCategory\(category\.code\)/);
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

test('preview reachability checks exclude provider-owned Google Maps controls', async () => {
  const [script, map] = await Promise.all([
    read('../../scripts/check-preview-interactions.mjs'),
    read('app/map/page.tsx')
  ]);

  assert.match(map, /data-map-surface="true"/);
  assert.match(script, /lastApplicationControl/);
  assert.match(script, /!element\.closest\('\[data-map-surface="true"\]'\)/);
  assert.match(script, /Provider map internals are excluded from application-control reachability/);
  assert.match(script, /record\.lastControl = await last\.evaluate/);
});

test('assistant stays owned by the global header while its panel can open without creating page flow', async () => {
  const [styles, layout] = await Promise.all([
    read('app/components/smart-assistant.module.css'),
    read('app/layout.tsx')
  ]);
  const root = styles.match(/\.root\{([^}]*)\}/)?.[1] ?? '';
  const panel = styles.match(/\.panel\{([^}]*)\}/)?.[1] ?? '';
  const mobile = styles.split('@media(max-width:38rem)')[1] ?? '';

  assert.match(layout, /<div className="khedma-header-actions"><AuthNavigation \/><ThemeToggle \/><SmartAssistant \/><\/div>/);
  assert.doesNotMatch(layout, /<\/header>\s*<SmartAssistant \/>\s*\{children\}/);
  assert.match(root, /position:relative/);
  assert.match(root, /display:flex/);
  assert.doesNotMatch(root, /position:(?:fixed|sticky)|inset-inline-(?:start|end)/);
  assert.match(panel, /position:absolute/);
  assert.doesNotMatch(mobile, /\.root\{[^}]*position:(?:fixed|sticky)/);
  assert.match(mobile, /\.panel\{[^}]*position:fixed/);
});
