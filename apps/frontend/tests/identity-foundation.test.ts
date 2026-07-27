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
  assert.match(register, /minLength=\{12\}/);
  assert.match(register, /جاري إنشاء الحساب/);
  assert.match(profile, /role="status"/);
});
