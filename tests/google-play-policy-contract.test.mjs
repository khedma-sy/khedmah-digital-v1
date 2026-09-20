import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');
const gradle = read('apps/android/app/build.gradle.kts');
const manifest = read('apps/android/app/src/main/AndroidManifest.xml');
const privacy = read('apps/frontend/app/privacy/page.tsx');
const deletion = read('apps/frontend/app/delete-account/page.tsx');
const terms = read('apps/frontend/app/terms/page.tsx');
const account = read('apps/frontend/app/users/me/page.tsx');
const layout = read('apps/frontend/app/layout.tsx');
const sitemap = read('apps/frontend/app/sitemap.ts');
const androidMain = read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt');

test('Android targets the current Play submission API level and keeps sensitive permissions minimal', () => {
  assert.match(gradle, /targetSdk\s*=\s*36/);
  assert.doesNotMatch(manifest, /READ_MEDIA_IMAGES|READ_MEDIA_VIDEO|READ_EXTERNAL_STORAGE/);
  assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);
  assert.match(manifest, /ACCESS_FINE_LOCATION/);
  assert.match(manifest, /ACCESS_COARSE_LOCATION/);
});

test('privacy policy reflects implemented data classes and providers rather than generic boilerplate', () => {
  for (const expected of ['Google/Firebase', 'Google Maps', 'Google Cloud', 'Resend', 'التحليلات', 'حذف الحساب', 'الموقع']) {
    assert.ok(privacy.includes(expected), `privacy policy must cover ${expected}`);
  }
  assert.match(privacy, /لا يطلب صلاحية الموقع في الخلفية/);
  assert.match(privacy, /support@khedmah\.uk/);
});

test('account deletion request is reachable from Web and Android account surfaces', () => {
  assert.match(account, /href="\/delete-account"/);
  assert.match(deletion, /mailto:support@khedmah\.uk/);
  assert.match(deletion, /حذف حساب خدمة/);
  assert.match(deletion, /لن نطلب كلمة المرور/);
  assert.ok(sitemap.includes('${SITE_URL}/delete-account'), 'delete-account must be listed in the sitemap');
  assert.match(androidMain, /طلب حذف الحساب والبيانات/);
  assert.match(androidMain, /mailto:support@khedmah\.uk/);
  assert.match(androidMain, /onDeleteAccount/);
});

test('privacy disclosure is visible in Android and legal resources are discoverable in the Web shell', () => {
  assert.match(androidMain, /سياسة الخصوصية/);
  assert.match(androidMain, /لا يطلب التطبيق صلاحية الموقع في الخلفية/);
  assert.match(androidMain, /Google\/Firebase/);
  assert.match(androidMain, /لا ترسل كلمات المرور أو الرموز السرية/);

  for (const route of ['/privacy', '/terms', '/delete-account']) {
    assert.ok(layout.includes(`href="${route}"`), `${route} must be linked from the global shell`);
    assert.ok(sitemap.includes('${SITE_URL}' + route), `${route} must be listed in the sitemap`);
  }
  assert.match(terms, /لا توفر المنصة حاليًا بوابة دفع إلكترونية/);
  assert.match(terms, /مراجعة قانونية/);
});
