import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('identity screens are Arabic-first and RTL-compatible', async () => {
  const login = await readFile(new URL('../app/auth/login/page.tsx', import.meta.url), 'utf8');
  const register = await readFile(new URL('../app/auth/register/page.tsx', import.meta.url), 'utf8');
  const profile = await readFile(new URL('../app/users/me/page.tsx', import.meta.url), 'utf8');

  assert.match(login, /تسجيل الدخول/);
  assert.match(register, /إنشاء حساب/);
  assert.match(profile, /الملف الأساسي/);
});

test('identity screens include validation, loading, and error states', async () => {
  const login = await readFile(new URL('../app/auth/login/page.tsx', import.meta.url), 'utf8');
  const register = await readFile(new URL('../app/auth/register/page.tsx', import.meta.url), 'utf8');
  const profile = await readFile(new URL('../app/users/me/page.tsx', import.meta.url), 'utf8');

  assert.match(login, /required/);
  assert.match(login, /role="alert"/);
  assert.match(login, /aria-busy/);
  assert.match(login, /minLength=\{8\}/);
  assert.match(register, /minLength=\{8\}/);
  assert.match(register, /جاري إنشاء الحساب/);
  assert.match(profile, /role="status"/);
});

test('global navigation separates guest discovery from authenticated account actions', async () => {
  const navigation = await readFile(new URL('../app/auth-navigation.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  assert.match(layout, /<AuthNavigation \/>/);
  assert.match(navigation, /api\.auth\.session\(\)/);
  assert.match(navigation, /data-auth-state="guest"/);
  assert.match(navigation, /href="\/search"/);
  assert.match(navigation, /href="\/service-catalog"/);
  assert.match(navigation, /href="\/locations"/);
  assert.match(navigation, /href="\/auth\/login"/);
  assert.match(navigation, /href="\/auth\/register"/);
  assert.match(navigation, /data-auth-state="authenticated"/);
  assert.match(navigation, /user\.profile\.displayName/);
  assert.match(navigation, /href="\/users\/me"/);
  assert.match(navigation, /href="\/business-profiles"/);
  assert.match(navigation, /href="\/organizations"/);
  assert.match(navigation, /الملف الشخصي/);
  assert.match(navigation, /أعمالي/);
  assert.match(navigation, /منظماتي/);
  assert.match(navigation, /user\.profile\.displayName/);
  assert.match(navigation, /href="\/users\/me"/);
  assert.match(navigation, /api\.auth\.logout\(\)/);
  assert.match(navigation, /تسجيل الخروج/);
  assert.match(navigation, />دخول<\/Link>/);
});
