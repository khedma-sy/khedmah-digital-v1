import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage presents the approved five-second discovery hierarchy', async () => {
  const home = await read('app/page.tsx');

  assert.match(home, /KHEDMA/);
  assert.match(home, /خدماتك أقرب/);
  assert.match(home, /ابحث عن خدمة/);
  assert.match(home, /استكشف ملفات الأعمال/);
  assert.match(home, /أضف ملف عملك/);
  assert.match(home, /name="cityCode"/);
  assert.match(home, /PlatformIcon name="search"/);
  assert.match(home, /PlatformIcon name="grid"/);
  assert.match(home, /PlatformIcon name="pin"/);
});

test('homepage removes competing marketing and decorative concepts', async () => {
  const home = await read('app/page.tsx');

  for (const forbidden of ['BrandHero', 'orbit', 'خطط تنمو معك', 'Premium', '100%', 'كل الخدمات تحت مظلة واحدة']) {
    assert.doesNotMatch(home, new RegExp(forbidden));
  }
  assert.equal((home.match(/className=\{styles\.primaryAction\}/g) ?? []).length, 1);
  assert.equal((home.match(/className=\{styles\.secondaryAction\}/g) ?? []).length, 2);
});

test('homepage is mobile-first and supports system themes and controlled motion', async () => {
  const styles = await read('app/home.module.css');

  assert.match(styles, /@media \(min-width: 48rem\)/);
  assert.match(styles, /@media \(prefers-color-scheme: dark\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /animation:/);
});

test('registration opens a protected, personalized welcome experience', async () => {
  const register = await read('app/auth/register/page.tsx');
  const welcome = await read('app/welcome/page.tsx');

  assert.match(register, /router\.push\('\/welcome'\)/);
  assert.match(welcome, /api\.auth\.session\(\)/);
  assert.match(welcome, /router\.replace\('\/auth\/login'\)/);
  assert.match(welcome, /مرحباً بك في خدمة ديجتل/);
  assert.match(welcome, /لن ننشر اسمك أو موقعك دون موافقتك/);
  assert.match(welcome, /<ShareAction/);
});

test('navigation avoids duplicate links and interactions respect reduced motion', async () => {
  const layout = await read('app/layout.tsx');
  const navigation = await read('app/auth-navigation.tsx');
  const styles = await read('app/globals.css');

  assert.equal((layout.match(/>الخدمات<\/Link>/g) ?? []).length, 0);
  assert.equal((navigation.match(/>الخدمات<\/Link>/g) ?? []).length, 1);
  assert.match(layout, /className="brand-dock"/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('approved actions use the unified SVG icon system', async () => {
  const icon = await read('app/components/platform-icon.tsx');
  const home = await read('app/page.tsx');

  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.match(home, /PlatformIcon/);
  assert.doesNotMatch(home, /[🏢👤📍🔍✨✦⌖]/u);
});
