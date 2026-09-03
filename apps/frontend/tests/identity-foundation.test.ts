import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('identity screens are Arabic-first and RTL-compatible', async () => {
  const login = await readFile(new URL('../app/auth/login/page.tsx', import.meta.url), 'utf8');
  const register = await readFile(new URL('../app/auth/register/page.tsx', import.meta.url), 'utf8');
  const profile = await readFile(new URL('../app/users/me/page.tsx', import.meta.url), 'utf8');

  assert.match(login, /تسجيل الدخول/);
  assert.match(register, /إنشاء حساب/);
  assert.match(profile, /حسابي/);
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
  assert.match(profile, /api\.auth\.session\(\)/);
  assert.match(profile, /SkeletonGrid/);
  assert.match(profile, /StatusMessage/);
  assert.doesNotMatch(profile, /setTimeout/);
});

test('registration is a scoped responsive identity gateway with honest provider states', async () => {
  const register = await readFile(new URL('../app/auth/register/page.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../app/auth-experience.css', import.meta.url), 'utf8');

  assert.match(register, /auth-register-experience/);
  assert.match(register, /register-brand-panel/);
  assert.match(register, /أنشئ حسابك في خدمة/);
  assert.match(register, /سنرسل رابطًا إلى بريدك لتأكيده قبل تفعيل الحساب/);
  assert.match(register, /form\.checkValidity\(\)/);
  assert.match(register, /form\.reportValidity\(\)/);
  assert.match(register, /register-password-status/);
  assert.match(register, /aria-pressed=\{visiblePassword === 'password'\}/);
  assert.match(register, /register-provider-unavailable/);
  assert.doesNotMatch(register, /register-heading/);
  assert.match(styles, /--register-blue:#07427c/);
  assert.match(styles, /\.auth-phone-register \.identity-language \{ display:none; \}/);
  assert.match(styles, /width:min\(100%,68rem\)/);
  assert.match(styles, /@media\(max-width:58rem\)/);
  assert.match(styles, /@media\(max-width:42rem\)/);
});

test('global navigation separates guest discovery from authenticated account actions', async () => {
  const navigation = await readFile(new URL('../app/auth-navigation.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  assert.match(layout, /<AuthNavigation \/>/);
  assert.match(navigation, /api\.auth\.session\(\)/);
  assert.match(navigation, /data-auth-state="guest"/);
  assert.match(navigation, /href: '\/search'/);
  assert.match(navigation, /href: '\/categories'/);
  assert.match(navigation, /href: '\/map'/);
  assert.match(navigation, /href="\/auth\/login"/);
  assert.match(navigation, /href="\/auth\/register"/);
  assert.match(navigation, /data-auth-state="authenticated"/);
  assert.match(navigation, /user\.profile\.displayName/);
  assert.match(navigation, /href="\/users\/me"/);
  assert.match(navigation, /href="\/business-profiles"/);
  assert.match(navigation, /الملف الشخصي/);
  assert.match(navigation, /أعمالي/);
  assert.doesNotMatch(navigation, /منظماتي|\/organizations/);
  assert.match(navigation, /user\.profile\.displayName/);
  assert.match(navigation, /href="\/users\/me"/);
  assert.match(navigation, /api\.auth\.logout\(\)/);
  assert.match(navigation, /تسجيل الخروج/);
  assert.match(navigation, />دخول<\/Link>/);
});
