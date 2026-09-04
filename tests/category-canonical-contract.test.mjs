import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Migration 017 owns canonical Category authority without fake seeds', async () => {
  const sql = await read('backend/migrations/versions/017_category_taxonomy_contract.sql');
  assert.match(sql, /CREATE TABLE categories/);
  assert.match(sql, /categories_code_format_check/);
  assert.match(sql, /business_profiles_category_code_fk/);
  assert.match(sql, /service_listings_category_code_fk/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+categories/i);
});

test('Migration 017 rollback removes references before Category authority', async () => {
  const rollback = await read('backend/migrations/versions/017_category_taxonomy_contract_rollback.sql');
  const serviceFk = rollback.indexOf('service_listings_category_code_fk');
  const categoryTable = rollback.indexOf('DROP TABLE IF EXISTS categories');
  assert.ok(serviceFk >= 0 && categoryTable > serviceFk);
});

test('Business and Service writes use the shared active Category authority', async () => {
  const [business, services] = await Promise.all([
    read('apps/backend/src/business-profiles/business-profile.service.ts'),
    read('apps/backend/src/service-catalog/service-catalog.service.ts')
  ]);
  assert.match(business, /categories\.assertActiveCategory/);
  assert.match(services, /categories\.assertActiveCategory/);
});

test('frontend Category choices come from the canonical API', async () => {
  const [hook, businessPage, catalogPage, brandStyles] = await Promise.all([
    read('apps/frontend/lib/use-categories.ts'),
    read('apps/frontend/app/business-profiles/new/page.tsx'),
    read('apps/frontend/app/components/category-directory.tsx'),
    read('apps/frontend/app/brand-system.css')
  ]);
  assert.match(hook, /api\.categories\.list/);
  assert.match(businessPage, /useCategories/);
  assert.match(catalogPage, /useCategories/);
  assert.match(catalogPage, /data-visual=\{category\.visualKey\}/);
  for (const visual of ['home','food','health','education','professional','beauty','shopping','automotive','transport','technology','construction','events','agriculture','industry','travel'])
    assert.match(brandStyles, new RegExp(`data-visual="${visual}"`));
});
