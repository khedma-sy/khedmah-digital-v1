import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('classifieds public discovery is independent from Store and feature-gated', async () => {
  const [page, store] = await Promise.all([read('apps/frontend/app/classifieds/page.tsx'), read('apps/frontend/app/store/page.tsx')]);
  assert.match(page, /CLASSIFIEDS_ENABLED/);
  assert.match(page, /classifiedsApi\.list/);
  assert.match(page, /\/classifieds\/new/);
  assert.match(page, /\/classifieds\/manage/);
  assert.doesNotMatch(page, /api\.products|ProductListing|\.\.\/store\/page|\/store\/products|\/store\/sell/);
  assert.doesNotMatch(store, /classifieds|isClassifieds/);
});

test('owner classifieds journey stays on independent routes and uses durable quota/revision APIs', async () => {
  const [create, manage, edit, detail, client] = await Promise.all([
    read('apps/frontend/app/classifieds/new/page.tsx'),
    read('apps/frontend/app/classifieds/manage/page.tsx'),
    read('apps/frontend/app/classifieds/manage/[id]/edit/page.tsx'),
    read('apps/frontend/app/classifieds/[id]/page.tsx'),
    read('apps/frontend/lib/classifieds-client.ts')
  ]);
  for (const source of [create, manage, edit, detail]) assert.doesNotMatch(source, /api\.products|\/store\/products|\/store\/manage|\/store\/sell/);
  assert.match(create, /classifiedsApi\.quota/);
  assert.match(create, /classifiedsApi\.create/);
  assert.match(create, /classifiedsApi\.uploadImage/);
  assert.match(create, /classifiedsApi\.submit/);
  assert.match(edit, /expectedContentRevision/);
  assert.match(edit, /classifiedsApi\.deleteImage/);
  assert.match(edit, /classifiedsApi\.deactivate/);
  assert.match(edit, /classifiedsApi\.submit/);
  assert.match(detail, /classifiedsApi\.get/);
  assert.match(detail, /https:\/\/wa\.me/);
  assert.match(client, /\/classifieds\/mine/);
  assert.match(client, /\/classifieds\/quota/);
  assert.match(client, /\/classifieds\/\$\{encodeURIComponent\(id\)\}\/media/);
  assert.match(client, /clientRequestId/);
});

test('public and owner ad DTOs keep moderation authority out of public discovery', async () => {
  const client = await read('apps/frontend/lib/classifieds-client.ts');
  assert.match(client, /export interface PublicAdListing extends AdListingBase/);
  assert.match(client, /export interface OwnerAdListing extends AdListingBase/);
  assert.match(client, /readonly rejectionReason\?: string/);
  assert.match(client, /readonly reviewRevision: number/);
  assert.match(client, /request<\{ ads: PublicAdListing\[\] \}>/);
  assert.match(client, /request<\{ ads: OwnerAdListing\[\] \}>\('\/classifieds\/mine'\)/);
});

test('home classifieds strip never falls back to Product/Store inventory', async () => {
  const recent = await read('apps/frontend/app/components/recently-added.tsx');
  assert.match(recent, /classifiedsApi\.list/);
  assert.match(recent, /CLASSIFIEDS_ENABLED/);
  assert.match(recent, /\/classifieds\/\$\{encodeURIComponent\(ad\.id\)\}/);
  assert.doesNotMatch(recent, /api\.products|\/store\/products|\/store\/sell/);
});

test('classifieds navigation is active only for classifieds routes', async () => {
  const navigation = await read('apps/frontend/app/auth-navigation.tsx');
  assert.match(navigation, /href: '\/classifieds'.*active: pathname\.startsWith\('\/classifieds'\)/);
  assert.doesNotMatch(navigation, /pathname\.startsWith\('\/store'\).*classifieds/);
});

test('classifieds images preserve the complete image and owner edit uses authenticated media route', async () => {
  const [css, edit] = await Promise.all([read('apps/frontend/app/classifieds/classifieds.module.css'), read('apps/frontend/app/classifieds/manage/[id]/edit/page.tsx')]);
  assert.match(css, /\.image img\{[^}]*object-fit:contain/);
  assert.match(edit, /\/api\/v1\/classifieds\/\$\{encodeURIComponent\(ad\.id\)\}\/media\/\$\{encodeURIComponent\(image\.id\)\}/);
  assert.doesNotMatch(css, /umbrella-pattern\.svg/);
});

test('Store subroutes no longer present products as classifieds or return to classifieds', async () => {
  const [sell, detail] = await Promise.all([
    read('apps/frontend/app/store/sell/page.tsx'),
    read('apps/frontend/app/store/products/[id]/page.tsx')
  ]);
  assert.match(sell, /eyebrow="متجر خدمة"/);
  assert.match(sell, /ظهوره في المتجر/);
  assert.doesNotMatch(sell, /الإعلانات المبوبة|إعلاناتي|\/classifieds/);
  assert.match(detail, /eyebrow="متجر خدمة"/);
  assert.match(detail, /backHref="\/store"/);
  assert.doesNotMatch(detail, /إعلان مبوب|backHref="\/classifieds"/);
});
