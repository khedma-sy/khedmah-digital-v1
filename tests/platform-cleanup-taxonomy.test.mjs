import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('migration 022 installs the full hierarchical taxonomy requested for discovery', async () => {
  const migration = await read('backend/migrations/versions/022_expand_category_taxonomy.sql');
  for (const code of [
    'home_maintenance', 'food_hospitality', 'health_medical', 'education_training',
    'professional_services', 'retail_shopping', 'automotive', 'transport_logistics',
    'technology_digital', 'construction_real_estate', 'events_occasions',
    'agriculture_livestock', 'industrial_supply', 'travel_tourism',
    'electrician', 'plumber', 'butcher', 'grocery', 'taxi', 'delivery_courier',
    'kitchen_installation', 'upholstery', 'gas_appliance_repair', 'fish_poultry_shop',
    'juice_icecream', 'car_dealership', 'international_trade', 'farm_chalet_rental'
  ]) assert.match(migration, new RegExp(`\\('${code}'`));
  assert.match(migration, /ADD COLUMN parent_code TEXT/);
  assert.match(migration, /ADD COLUMN search_aliases_ar TEXT\[\]/);
  assert.match(migration, /categories_parent_code_fk/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN.*organization_id/);
});

test('category discovery accepts parent filters and Arabic aliases while owner writes require a leaf', async () => {
  const [businessRepository, serviceRepository, businessService, serviceCatalogService, categoryService, categoryUi] = await Promise.all([
    read('apps/backend/src/business-profiles/business-profile.repository.ts'),
    read('apps/backend/src/service-catalog/service-catalog.repository.ts'),
    read('apps/backend/src/business-profiles/business-profile.service.ts'),
    read('apps/backend/src/service-catalog/service-catalog.service.ts'),
    read('apps/backend/src/categories/category.service.ts'),
    read('apps/frontend/app/components/category-select-options.tsx')
  ]);
  for (const repository of [businessRepository, serviceRepository]) {
    assert.match(repository, /WITH RECURSIVE category_tree/);
    assert.match(repository, /search_aliases_ar/);
  }
  assert.match(categoryService, /hasActiveChildren/);
  assert.match(categoryService, /assertActiveCategoryFilter/);
  assert.match(businessService, /async search[\s\S]*assertActiveCategoryFilter/);
  assert.match(serviceCatalogService, /async search[\s\S]*assertActiveCategoryFilter/);
  assert.match(categoryUi, /allowRoots/);
  assert.match(categoryUi, /<optgroup/);
});
