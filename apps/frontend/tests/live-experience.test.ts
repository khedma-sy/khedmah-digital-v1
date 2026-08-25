import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage presents the approved five-second discovery hierarchy', async () => {
  const home = await read('app/page.tsx');

  assert.match(home, /خدمة…/);
  assert.match(home, /تحت مظلة واحدة/);
  assert.match(home, /اكتشف الخدمات/);
  assert.match(home, /أضف نشاطك/);
  assert.match(home, /SyriaMap/);
  assert.match(home, /PlatformIcon name="search"/);
  assert.match(home, /PlatformIcon name="briefcase"/);
});

test('homepage removes competing marketing and decorative concepts', async () => {
  const home = await read('app/page.tsx');

  for (const forbidden of ['BrandHero', 'orbit', 'خطط تنمو معك', 'Premium', '100%', 'كل الخدمات تحت مظلة واحدة']) {
    assert.doesNotMatch(home, new RegExp(forbidden));
  }
  assert.equal((home.match(/className=\{styles\.primaryAction\}/g) ?? []).length, 1);
  assert.equal((home.match(/className=\{styles\.secondaryAction\}/g) ?? []).length, 1);
});

test('homepage is mobile-first and supports system themes and controlled motion', async () => {
  const styles = await read('app/home.module.css');

  assert.match(styles, /@media \(max-width: 64rem\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /animation:/);
});

test('registration requires email verification before the protected welcome experience', async () => {
  const register = await read('app/auth/register/page.tsx');
  const welcome = await read('app/welcome/page.tsx');

  assert.match(register, /router\.push\(`\/auth\/verify-email\?email=\$\{encodeURIComponent\(email\)\}`\)/);
  assert.match(welcome, /api\.auth\.session\(\)/);
  assert.match(welcome, /router\.replace\('\/auth\/login'\)/);
  assert.match(welcome, /مرحباً بك في خدمة ديجتل/);
  assert.match(welcome, /لن ننشر اسمك أو موقعك دون موافقتك/);
  assert.match(welcome, /completeOnboarding/);
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

test('service discovery always leads to the real provider profile', async () => {
  const search = await read('app/search/page.tsx');

  assert.match(search, /s\.ownerType === 'business'/);
  assert.match(search, /`\/business-profiles\/\$\{s\.ownerId\}`/);
  assert.match(search, /`\/professional-profiles\/\$\{s\.ownerId\}`/);
  assert.match(search, /عرض مقدم الخدمة/);
  assert.doesNotMatch(search, /[🔍🗺🟢🟡🔴]/u);
});
