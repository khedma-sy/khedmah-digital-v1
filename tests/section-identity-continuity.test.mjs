import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = async (path) => { try { await access(new URL(`../${path}`, import.meta.url)); return true; } catch { return false; } };

test('route families own identity at layout level instead of landing-page-only styling', async () => {
  const [food, store, classifieds, taxi, auth, mobility, themes] = await Promise.all([
    read('apps/frontend/app/food/layout.tsx'),
    read('apps/frontend/app/store/layout.tsx'),
    read('apps/frontend/app/classifieds/layout.tsx'),
    read('apps/frontend/app/taxi/layout.tsx'),
    read('apps/frontend/app/auth/layout.tsx'),
    read('apps/frontend/app/mobility/layout.tsx'),
    read('apps/frontend/app/section-themes.css')
  ]);
  assert.match(food, /data-khedmah-section="food"/);
  assert.match(store, /data-khedmah-section="store"/);
  assert.match(classifieds, /data-khedmah-section="classifieds"/);
  assert.match(taxi, /data-khedmah-section="taxi"/);
  assert.match(auth, /data-khedmah-section="auth"/);
  assert.match(mobility, /data-khedmah-section="mobility"/);
  assert.match(themes, /\.khedmah-section-identity \.ui-page/);
  assert.match(themes, /\[data-khedmah-section='store'\]/);
  assert.match(themes, /\[data-khedmah-section='classifieds'\]/);
  assert.match(themes, /\[data-khedmah-section='taxi'\]/);
  assert.match(themes, /\[data-khedmah-section='mobility'\]\s*\{[^}]*--section-accent:\s*var\(--brand-green\)/s);
  assert.match(themes, /\[data-khedmah-section='taxi'\][\s\S]*?--section-accent:\s*var\(--brand-navy\)/);
});

test('existing nested Store and Classifieds routes remain covered by their parent layout', async () => {
  const routes = [
    'apps/frontend/app/store/page.tsx',
    'apps/frontend/app/store/sell/page.tsx',
    'apps/frontend/app/store/manage/page.tsx',
    'apps/frontend/app/store/products/[id]/page.tsx',
    'apps/frontend/app/store/manage/[id]/edit/page.tsx',
    'apps/frontend/app/classifieds/page.tsx',
    'apps/frontend/app/classifieds/new/page.tsx',
    'apps/frontend/app/classifieds/manage/page.tsx',
    'apps/frontend/app/classifieds/[id]/page.tsx',
    'apps/frontend/app/classifieds/manage/[id]/edit/page.tsx'
  ];
  for (const route of routes) assert.equal(await exists(route), true, `${route} must remain covered by its section layout`);
});

test('landing states do not claim a failed search before the user has a search context', async () => {
  const [categories, store, classifieds] = await Promise.all([
    read('apps/frontend/app/components/category-directory.tsx'),
    read('apps/frontend/app/store/page.tsx'),
    read('apps/frontend/app/classifieds/page.tsx')
  ]);
  assert.match(categories, /services\.length === 0 && hasResultContext/);
  assert.match(store, /hasFilters \? 'لا توجد منتجات مطابقة' : 'لا توجد منتجات منشورة بعد'/);
  assert.match(classifieds, /hasFilters \? 'لا توجد إعلانات مطابقة' : 'لا توجد إعلانات منشورة بعد'/);
});
