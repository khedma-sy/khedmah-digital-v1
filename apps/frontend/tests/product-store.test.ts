import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('store journey includes discovery, selling, owner management and public detail', async () => {
  const [store, sell, manage, edit, detail, client] = await Promise.all([
    read('app/store/page.tsx'),
    read('app/store/sell/page.tsx'),
    read('app/store/manage/page.tsx'),
    read('app/store/manage/[id]/edit/page.tsx'),
    read('app/store/products/[id]/page.tsx'),
    read('lib/api-client.ts')
  ]);
  assert.match(store, /api\.products\.list/);
  assert.match(store, /query\.get\('q'\)/);
  assert.match(store, /كل التصنيفات/);
  assert.match(store, /كل المدن/);
  assert.match(store, /syncUrl\(filters\)/);
  assert.match(store, /aria-label="البحث في الإعلانات"/);
  assert.match(store, /إعلان مطابق/);
  assert.match(store, /التفاصيل والتواصل/);
  assert.match(store, /لن نعرض منتجات وهمية/);
  assert.match(store, /retryCategories/);
  assert.match(store, /retryCities/);
  assert.match(sell, /api\.businesses\.listMine/);
  assert.match(sell, /api\.products\.create/);
  assert.match(sell, /api\.media\.uploadProduct/);
  assert.match(sell, /api\.products\.submit/);
  assert.match(manage, /api\.products\.listMine/);
  assert.match(manage, /تعديل المنتج/);
  assert.match(edit, /api\.products\.update/);
  assert.match(edit, /api\.products\.submit/);
  assert.match(edit, /api\.media\.listForOwner/);
  assert.match(edit, /api\.media\.delete/);
  assert.match(edit, /حذف واستبدال/);
  assert.match(detail, /https:\/\/wa\.me/);
  assert.match(detail, /navigator\.clipboard\.writeText/);
  assert.match(client, /\/admin\/products\/pending/);
});

test('store preserves complete product images and exposes navigation after login', async () => {
  const [styles, navigation, account, moderation] = await Promise.all([
    read('app/store/store.module.css'),
    read('app/auth-navigation.tsx'),
    read('app/users/me/page.tsx'),
    read('app/admin/moderation/page.tsx')
  ]);
  assert.match(styles, /object-fit:contain/);
  assert.match(navigation, /href: '\/classifieds'/);
  assert.match(account, /href="\/store\/sell"/);
  assert.match(account, /href="\/store\/manage"/);
  assert.match(moderation, /api\.adminProducts\.pending/);
  assert.match(moderation, /الإعلانات|منتجات متجر خدمة/);
});
