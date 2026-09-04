import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('store journey includes discovery, selling, owner management and public detail', async () => {
  const [store, categoryFilter, sell, manage, edit, detail, client] = await Promise.all([
    read('app/store/page.tsx'),
    read('app/components/hierarchical-category-filter.tsx'),
    read('app/store/sell/page.tsx'),
    read('app/store/manage/page.tsx'),
    read('app/store/manage/[id]/edit/page.tsx'),
    read('app/store/products/[id]/page.tsx'),
    read('lib/api-client.ts')
  ]);
  assert.match(store, /api\.products\.list/);
  assert.match(store, /query\.get\('q'\)/);
  assert.match(store, /HierarchicalCategoryFilter/);
  assert.match(categoryFilter, /كل المجالات/);
  assert.match(categoryFilter, /اختر المجال أولًا/);
  assert.match(categoryFilter, /category\.parentCode === rootCode/);
  assert.match(store, /كل المدن/);
  assert.match(store, /ابحث\. قارن\. تواصل\./);
  assert.match(store, /إعلانات محلية موثوقة/);
  assert.match(store, /تصفح الإعلانات حسب التصنيف/);
  assert.match(store, /البحث في الإعلانات/);
  assert.match(store, /أضف إعلانًا/);
  assert.match(store, /تحقق من المنتج وتفاصيله قبل الدفع أو الاستلام/);
  assert.match(store, /أنشطة موثّقة/);
  assert.match(store, /aria-label="إجراءات المتجر"/);
  assert.doesNotMatch(store, /href="\/orders\/courier"/);
  assert.match(store, /aria-controls="store-advanced-filters"/);
  assert.match(store, /data-open=\{filtersOpen\}/);
  assert.match(store, /الإعلانات المتاحة/);
  assert.match(store, /كل الحالات/);
  assert.match(store, /كل العملات/);
  assert.match(store, /السعر من/);
  assert.match(store, /السعر إلى/);
  assert.match(store, /price_asc/);
  assert.match(store, /validatePriceRange/);
  assert.match(store, /نشاط موثّق/);
  assert.match(store, /dateTime=\{product\.createdAt\}/);
  assert.match(store, /syncUrl\(filters\)/);
  assert.match(store, /aria-label="البحث في الإعلانات"/);
  assert.match(store, /إعلان مطابق/);
  assert.match(store, /التفاصيل والتواصل/);
  assert.match(store, /كن أول من ينشر في سوق خدمة/);
  assert.match(store, /عرض جميع الإعلانات/);
  assert.match(store, /retryCategories/);
  assert.match(store, /retryCities/);
  assert.match(sell, /api\.businesses\.listMine/);
  assert.match(sell, /api\.products\.create/);
  assert.match(sell, /api\.media\.uploadProduct/);
  assert.match(sell, /api\.products\.submit/);
  assert.match(manage, /api\.products\.listMine/);
  assert.match(manage, /رصيد الإعلانات/);
  assert.match(manage, /advertisingPolicy\.listingLimitPerUser/);
  assert.match(manage, /إعلانات متبقية/);
  assert.match(manage, /<progress/);
  assert.match(manage, /الباقات المدفوعة غير مفعّلة بعد/);
  assert.match(manage, /تعديل المنتج/);
  assert.match(manage, /api\.products\.deactivate/);
  assert.match(manage, /إلغاء نشر الإعلان/);
  assert.match(manage, /تعديل وإعادة نشر/);
  assert.match(manage, /لا يوجد رصيد لإعادة نشر هذا الإعلان/);
  assert.match(manage, /product\.status === 'active' && product\.moderationStatus === 'approved'/);
  assert.match(edit, /api\.products\.update/);
  assert.match(edit, /api\.products\.submit/);
  assert.match(sell, /ينشر الإعلان المطابق تلقائيًا/);
  assert.match(sell, /اكتمل رصيد الإعلانات المجانية/);
  assert.match(sell, /advertisingPolicy\.listingLimitPerUser/);
  assert.match(sell, /التسعير والدفع قيد التجهيز ولم يُفعّل أي شراء بعد/);
  assert.match(sell, /listingUsage\.limit/);
  assert.match(edit, /api\.media\.listForOwner/);
  assert.match(edit, /api\.media\.delete/);
  assert.match(edit, /حذف واستبدال/);
  assert.match(detail, /https:\/\/wa\.me/);
  assert.match(detail, /navigator\.clipboard\.writeText/);
  assert.match(detail, /نشاط موثّق/);
  assert.match(detail, /dateTime=\{product\.createdAt\}/);
  assert.match(client, /params\.set\('availability'/);
  assert.match(client, /params\.set\('currency'/);
  assert.match(client, /params\.set\('minPrice'/);
  assert.match(client, /params\.set\('maxPrice'/);
  assert.match(client, /params\.set\('sort'/);
  assert.match(client, /\/admin\/products\/pending/);
});

test('store preserves complete product images and exposes navigation after login', async () => {
  const [styles, navigation, account, moderation] = await Promise.all([
    read('app/store/store.module.css'),
    read('app/auth-navigation.tsx'),
    read('app/users/me/page.tsx'),
    read('app/admin/moderation/page.tsx')
  ]);
  assert.match(styles, /object-fit:\s*contain/);
  assert.match(navigation, /href: '\/classifieds'/);
  assert.match(account, /href="\/store\/sell"/);
  assert.match(account, /href="\/store\/manage"/);
  assert.match(moderation, /api\.adminProducts\.pending/);
  assert.match(moderation, /الإعلانات|منتجات متجر خدمة/);
});
