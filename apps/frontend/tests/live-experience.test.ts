import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage communicates the live KHEDMA DIGITAL platform experience', async () => {
  const home = await read('app/page.tsx');
  const hero = await read('app/components/brand-hero.tsx');

  assert.match(hero, /KHEDMA DIGITAL/);
  assert.match(hero, /كل الخدمات تحت مظلة واحدة/);
  assert.match(hero, /اكتشف الخدمات/);
  assert.match(hero, /ابحث عن خدمة/);
  assert.match(hero, /إنشاء حساب/);
  for (const label of ['الأعمال', 'المهنيون', 'الخدمات', 'المواقع', 'للعميل', 'للمهني', 'للأعمال']) assert.match(home, new RegExp(label));
  assert.match(home, /أعمال موثقة/);
  assert.match(home, /أنا مع خدمة/);
});

test('registration opens a protected, personalized welcome experience', async () => {
  const register = await read('app/auth/register/page.tsx');
  const welcome = await read('app/welcome/page.tsx');

  assert.match(register, /router\.push\('\/welcome'\)/);
  assert.match(welcome, /api\.auth\.session\(\)/);
  assert.match(welcome, /router\.replace\('\/auth\/login'\)/);
  assert.match(welcome, /مرحباً بك في خدمة ديجتل/);
  assert.match(welcome, /أصبحت ضمن شبكة/);
  assert.match(welcome, /لن ننشر اسمك أو موقعك دون موافقتك/);
  assert.match(welcome, /أضف صورتك/);
  assert.match(welcome, /أضف تخصصك/);
  assert.match(welcome, /أضف شعار عملك/);
  assert.match(welcome, /أضف خدماتك/);
  assert.match(welcome, /<ShareAction/);
});

test('navigation avoids duplicate links and interactions respect reduced motion', async () => {
  const layout = await read('app/layout.tsx');
  const navigation = await read('app/auth-navigation.tsx');
  const register = await read('app/auth/register/page.tsx');
  const styles = await read('app/globals.css');

  assert.equal((layout.match(/>الخدمات<\/Link>/g) ?? []).length, 0);
  assert.equal((navigation.match(/>الخدمات<\/Link>/g) ?? []).length, 1);
  assert.match(layout, /brand-symbol">KD/);
  assert.match(register, /name="city"/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('approved actions use the unified icon and interaction system', async () => {
  const action = await read('app/components/platform-action.tsx');
  const icon = await read('app/components/platform-icon.tsx');
  const navigation = await read('app/auth-navigation.tsx');
  const hero = await read('app/components/brand-hero.tsx');

  assert.match(action, /platform-action-\$\{variant\}/);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.match(navigation, /aria-busy=\{isLoggingOut\}/);
  assert.match(navigation, /nav-action-error/);
  assert.match(hero, /PlatformAction href="#province-map"/);
  assert.doesNotMatch(hero, /انضم كشريك/);
});
