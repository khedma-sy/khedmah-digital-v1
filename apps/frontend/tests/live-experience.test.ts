import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage presents the approved five-second discovery hierarchy', async () => {
  const home = await read('app/page.tsx');

  assert.match(home, /كل ما تحتاجه/);
  assert.match(home, /FeaturedCategories/);
  assert.match(home, /المطاعم/);
  assert.match(home, /التوصيل/);
  assert.match(home, /الخدمات المهنية/);
  assert.match(home, /href: '\/professional-profiles\/search'/);
  assert.match(home, /تكسي/);
  assert.match(home, /المتجر/);
  assert.match(home, /التصنيفات الرئيسية/);
  assert.match(home, /PlatformIcon name="search"/);
  assert.match(home, /khedma-community\.webp/);
});

test('homepage keeps four unique primary journeys and secondary taxi navigation', async () => {
  const home = await read('app/page.tsx');
  const launch = home.match(/const launchServices = \[([\s\S]*?)\];/)?.[1];
  assert.ok(launch, 'homepage launch services must be declared');
  const urls = [...launch.matchAll(/href: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(urls, ['/food', '/mobility?type=delivery', '/professional-profiles/search', '/store']);
  const secondary = home.match(/<div className=\{styles\.secondaryServices\}>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(secondary, 'secondary navigation must be present');
  assert.match(secondary, /href="\/taxi"/);
  assert.doesNotMatch(secondary, /href="\/store"/);
});

test('homepage removes competing marketing and decorative concepts', async () => {
  const home = await read('app/page.tsx');

  for (const forbidden of ['BrandHero', 'orbit', 'خطط تنمو معك', 'Premium', '100%', 'كل الخدمات تحت مظلة واحدة']) {
    assert.doesNotMatch(home, new RegExp(forbidden));
  }
  assert.doesNotMatch(home, /business-profiles\/new/);
  assert.match(home, /href="\/auth\/register"/);
});

test('homepage is mobile-first and supports system themes and controlled motion', async () => {
  const styles = await read('app/home.module.css');

  assert.match(styles, /@media\(max-width:64rem\)/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /overflow-x:clip/);
  assert.match(styles, /\.heroVisual[\s\S]*aspect-ratio:1200\/804/);
  assert.match(styles, /\.heroVisual>img[\s\S]*object-fit:contain/);
  assert.doesNotMatch(styles, /animation:/);
});

test('registration requires email verification before the protected welcome experience', async () => {
  const register = await read('app/auth/register/page.tsx');
  const welcome = await read('app/welcome/page.tsx');

  assert.match(register, /router\.push\(`\/auth\/verify-email\?email=\$\{encodeURIComponent\(email\)\}`\)/);
  assert.match(welcome, /api\.auth\.session\(\)/);
  assert.match(welcome, /router\.push\('\/auth\/login'\)/);
  assert.match(welcome, /مرحباً بك في خدمة/);
  assert.match(welcome, /لا ننشر بياناتك أو موقعك دون موافقتك/);
  assert.match(welcome, /completeOnboarding/);
});

test('navigation avoids duplicate links and interactions respect reduced motion', async () => {
  const layout = await read('app/layout.tsx');
  const navigation = await read('app/auth-navigation.tsx');
  const styles = await read('app/globals.css');

  assert.equal((layout.match(/>الخدمات<\/Link>/g) ?? []).length, 0);
  assert.equal((navigation.match(/>الخدمات<\/Link>/g) ?? []).length, 0);
  assert.match(navigation, /label: 'التصنيفات'/);
  assert.match(navigation, /label: 'المطاعم'/);
  assert.match(navigation, /label: 'المتجر'/);
  assert.match(layout, /className="khedma-header"/);
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
  assert.match(search, /`\/business-profiles\/\$\{encodeURIComponent\(s\.ownerId\)\}`/);
  assert.match(search, /`\/professional-profiles\/\$\{encodeURIComponent\(s\.ownerId\)\}`/);
  assert.doesNotMatch(search, /`\/(?:business|professional)-profiles\/\$\{s\.ownerId\}`/);
  assert.match(search, /عرض مقدم الخدمة/);
  assert.doesNotMatch(search, /[🔍🗺🟢🟡🔴]/u);
});
test('professional discovery card opens anonymous searchable directory, not owner profile', async () => {
  const home = await read('app/page.tsx');
  const publicSearch = await read('app/professional-profiles/search/page.tsx');
  assert.match(home, /href: '\/professional-profiles\/search'/);
  assert.match(publicSearch, /api\.professionals\.search\(/);
  assert.doesNotMatch(publicSearch, /api\.professionals\.getMine\(/);
  assert.doesNotMatch(publicSearch, /router\.replace\('\/auth\/login/);
});

test('search does not misrepresent profile availability as real-time online presence', async () => {
  const search = await read('app/search/page.tsx');
  assert.match(search, /يعلن أنه متاح للعمل/);
  assert.match(search, /يعلن أنه مشغول/);
  assert.match(search, /حسب الاتفاق/);
  assert.doesNotMatch(search, /value === 'available' \? 'متاح'/);
  assert.match(search, /availabilityLabel\(item\.availability\)/);
});
