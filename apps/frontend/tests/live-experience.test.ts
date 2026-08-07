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
  assert.match(hero, /انضم كشريك/);
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
  assert.match(welcome, /أضف صورتك/);
  assert.match(welcome, /أضف تخصصك/);
  assert.match(welcome, /أضف شعار عملك/);
  assert.match(welcome, /أضف خدماتك/);
  assert.match(welcome, /<ShareAction/);
});
