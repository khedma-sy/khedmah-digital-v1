import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser identity calls use the same-origin API proxy', async () => {
  const [apiClient, identityApi, nextConfig] = await Promise.all([
    read('apps/frontend/lib/api-client.ts'),
    read('apps/frontend/lib/identity-api.ts'),
    read('apps/frontend/next.config.ts')
  ]);

  assert.match(apiClient, /const API_BASE = ''/);
  assert.match(identityApi, /const API_BASE = ''/);
  assert.match(nextConfig, /source: '\/api\/v1\/:path\*'/);
  assert.match(nextConfig, /destination: `\$\{backendOrigin\}\/api\/v1\/:path\*`/);
});

test('pending accounts receive an actionable verification response', async () => {
  const [errors, service, login] = await Promise.all([
    read('apps/backend/src/identity/identity.errors.ts'),
    read('apps/backend/src/identity/identity.service.ts'),
    read('apps/frontend/app/auth/login/page.tsx')
  ]);

  assert.match(errors, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(service, /account\.status === 'pending'/);
  assert.match(login, /إعادة إرسال رابط التحقق/);
  assert.match(login, /verificationEmail/);
});

test('verification and password recovery mail include branded clickable HTML', async () => {
  const [provider, verification, recovery, template] = await Promise.all([
    read('apps/backend/src/identity/email/email-provider.ts'),
    read('apps/backend/src/identity/email/email-verification.service.ts'),
    read('apps/backend/src/identity/password-recovery.service.ts'),
    read('apps/backend/src/identity/email/khedmah-email-template.ts')
  ]);

  assert.match(provider, /htmlBody\?: string/);
  assert.match(provider, /html: message\.htmlBody/);
  assert.match(verification, /htmlBody: renderKhedmahEmail/);
  assert.match(recovery, /htmlBody: renderKhedmahEmail/);
  assert.match(template, /href="\$\{actionUrl\}"/);
  assert.match(template, /target="_blank"/);
  assert.match(verification, /actionLabel: 'تأكيد البريد الإلكتروني'/);
});

test('production email actions use one validated HTTPS site URL builder', async () => {
  const [siteUrl, verification, recovery] = await Promise.all([
    read('apps/backend/src/identity/email/public-site-url.ts'),
    read('apps/backend/src/identity/email/email-verification.service.ts'),
    read('apps/backend/src/identity/password-recovery.service.ts')
  ]);

  assert.match(siteUrl, /NEXT_PUBLIC_SITE_URL must be configured in production/);
  assert.match(siteUrl, /url\.protocol !== 'https:'/);
  assert.match(siteUrl, /url\.searchParams\.set\('token', token\)/);
  assert.match(verification, /buildPublicActionUrl\('\/auth\/verify-email', rawToken\)/);
  assert.match(recovery, /buildPublicActionUrl\('\/auth\/reset-password', rawToken\)/);
  assert.doesNotMatch(verification, /\?token=\$\{encodeURIComponent/);
  assert.doesNotMatch(recovery, /\?token=\$\{encodeURIComponent/);
});

test('login uses real vector provider marks and approved umbrella pattern', async () => {
  const [login, icons, styles] = await Promise.all([
    read('apps/frontend/app/auth/login/page.tsx'),
    read('apps/frontend/app/auth/social-provider-icon.tsx'),
    read('apps/frontend/app/auth-experience.css')
  ]);

  assert.match(login, /SocialProviderIcon provider="google"/);
  assert.match(login, /SocialProviderIcon provider="facebook"/);
  assert.match(icons, /fill="#4285f4"/);
  assert.match(icons, /fill="#1877f2"/);
  assert.match(styles, /auth-umbrella-pattern\.svg/);
});

test('the complete authentication journey uses the approved reference system', async () => {
  const [layout, styles, login, register, verify, forgot, reset] = await Promise.all([
    read('apps/frontend/app/layout.tsx'),
    read('apps/frontend/app/auth-experience.css'),
    read('apps/frontend/app/auth/login/page.tsx'),
    read('apps/frontend/app/auth/register/page.tsx'),
    read('apps/frontend/app/auth/verify-email/page.tsx'),
    read('apps/frontend/app/auth/forgot-password/page.tsx'),
    read('apps/frontend/app/auth/reset-password/page.tsx')
  ]);

  assert.match(layout, /import '\.\/auth-experience\.css'/);
  assert.match(styles, /url\('\/brand\/auth-umbrella-pattern\.svg'\)/);
  assert.match(styles, /background:url\('\/brand\/auth-umbrella-pattern\.svg'\) center\/cover no-repeat/);
  assert.match(styles, /background:var\(--k-glass\)/);
  assert.match(styles, /\.identity-approved-brand \.khedma-brand>svg \{ width:4\.35rem; \}/);
  assert.match(styles, /backdrop-filter:blur\(var\(--k-glass-blur\)\) saturate\(108%\)/);
  assert.match(styles, /background:linear-gradient\(90deg,var\(--k-color-primary\),var\(--k-color-accent\)\)/);
  assert.match(styles, /\.password-strength \{ color:var\(--k-color-text-muted\); font-size:\.75rem; font-weight:700; \}/);
  assert.match(styles, /\.identity-language/);
  assert.match(styles, /\.auth-social-grid/);
  assert.match(styles, /\.auth-help,\.login-prompt[^}]*color:var\(--k-color-text-muted\)!important/);
  assert.match(login, /auth-login-heading/);
  assert.match(register, /SocialProviderIcon provider="google"/);
  assert.match(register, /SocialProviderIcon provider="facebook"/);
  assert.match(register, /statusCode\?: number/);
  assert.match(register, /existing=1/);
  assert.equal((login.match(/href="\/auth\/register"/g) ?? []).length, 1);
  assert.equal((register.match(/href="\/auth\/login"/g) ?? []).length, 1);
  assert.doesNotMatch(login, /إنشاء حساب جديد/);
  assert.doesNotMatch(register, /لديك حساب بالفعل/);
  assert.match(verify, /هذا البريد مسجل مسبقًا/);
  assert.match(forgot, /auth-status-icon/);
  assert.match(reset, /auth-status-icon/);
});

test('authentication backdrop contains exactly two complete colored umbrellas', async () => {
  const pattern = await read('apps/frontend/public/brand/auth-umbrella-pattern.svg');
  assert.equal((pattern.match(/<use href="#umbrella"/g) ?? []).length, 2);
  assert.match(pattern, /#16875f/);
  assert.match(pattern, /#e97835/);
  assert.doesNotMatch(pattern, /x="-\d/);
});

test('public UI uses Khedmah only and profile fields remain readable', async () => {
  const [layout, profile, styles] = await Promise.all([
    read('apps/frontend/app/layout.tsx'),
    read('apps/frontend/app/users/me/page.tsx'),
    read('apps/frontend/app/brand-system.css')
  ]);

  assert.match(layout, /const SITE_NAME = 'خدمة'/);
  assert.doesNotMatch(layout, /خدمة ديجتل|Khedmah Digital V1/);
  assert.doesNotMatch(profile, /خدمة ديجتل|Khedmah Digital V1|أنا مع خدمة/);
  assert.match(styles, /\.identity-card h1,\.identity-card h2,\.identity-card label/);
  assert.match(styles, /\.identity-card input:focus,\.identity-card select:focus/);
});

test('retired locations directory redirects to the real map experience', async () => {
  const [navigation, locations, organizations] = await Promise.all([
    read('apps/frontend/app/auth-navigation.tsx'),
    read('apps/frontend/app/locations/page.tsx'),
    read('apps/frontend/app/organizations/page.tsx')
  ]);

  assert.match(navigation, /href: '\/map', label: 'بالقرب مني'/);
  assert.doesNotMatch(navigation, />المواقع</);
  assert.match(locations, /redirect\('\/map'\)/);
  assert.doesNotMatch(locations, /api\.locations|قائمة الدول|قائمة المدن/);
  assert.match(organizations, /href="\/map"[^>]*>الخريطة/);
});

test('service catalog no longer renders the legacy phone navigation', async () => {
  const catalog = await read('apps/frontend/app/components/category-directory.tsx');
  assert.doesNotMatch(catalog, /catalog-bottom/);
  assert.match(catalog, /catalog-category-grid/);
  assert.match(catalog, /فتح الخريطة/);
});

test('public provider profile hides internal audit history and technical categories', async () => {
  const profile = await read('apps/frontend/app/business-profiles/[id]/page.tsx');
  assert.doesNotMatch(profile, /getTrustHistory|سجل الثقة/);
  assert.match(profile, /خدمة محلية/);
  assert.match(profile, /business-cover-placeholder/);
});
