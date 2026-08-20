import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ordered welcome, home, and catalog journey has working navigation targets', async () => {
  const [welcome, home, catalog] = await Promise.all([
    read('app/welcome/page.tsx'),
    read('app/page.tsx'),
    read('app/service-catalog/page.tsx')
  ]);

  assert.match(welcome, /onClick=\{completeOnboarding\}/);
  assert.match(home, /href="\/service-catalog"/);
  assert.match(home, /href="\/auth\/register"/);
  assert.match(catalog, /href="\/" aria-label="العودة إلى الرئيسية"/);
  assert.match(catalog, /onClick=\{\(\) => setShowFilters/);
  assert.match(catalog, /selectCategory\(category\.code\)/);
  assert.match(catalog, /providerHref\(service\)/);
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
    read('app/service-catalog/page.tsx'),
    read('app/components/platform-icon.tsx')
  ]);

  for (const icon of ['arrow', 'userPlus', 'filter']) assert.match(icons, new RegExp(`${icon}:`));
  assert.match(home, /PlatformIcon name="search"/);
  assert.match(home, /PlatformIcon name="briefcase"/);
  assert.match(catalog, /PlatformIcon name="filter"/);
});
