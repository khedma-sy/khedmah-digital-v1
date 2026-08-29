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
  assert.match(migration, /UPDATE categories[\s\S]*SET status = 'inactive'/);
  assert.match(migration, /code NOT IN/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN.*organization_id/);
  assert.doesNotMatch(migration, /DELETE FROM categories/);
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
    assert.match(repository, /WITH RECURSIVE category_lineage/);
    assert.match(repository, /parent\.code = child\.parent_code/);
    assert.match(repository, /search_aliases_ar/);
  }
  assert.match(categoryService, /category\?\.parentCode/);
  assert.match(categoryService, /assertActiveCategoryFilter/);
  assert.match(businessService, /async search[\s\S]*assertActiveCategoryFilter/);
  assert.match(serviceCatalogService, /async search[\s\S]*assertActiveCategoryFilter/);
  assert.match(businessService, /input\.categoryCode && input\.categoryCode !== profile\.categoryCode/);
  assert.match(serviceCatalogService, /input\.categoryCode && input\.categoryCode !== service\.categoryCode/);
  assert.match(categoryUi, /allowRoots/);
  assert.match(categoryUi, /<optgroup/);
  assert.match(categoryUi, /children\.length === 0[\s\S]*return allowRoots \?/);
});

test('professional discovery does not present or retain an unsupported category filter', async () => {
  const [searchPage, mvpDefinition, taxonomy, blueprint] = await Promise.all([
    read('apps/frontend/app/search/page.tsx'),
    read('docs/product/KHEDMAH-DIGITAL-MVP-DEFINITION.md'),
    read('docs/product/UNIVERSAL-TAXONOMY-MODEL.md'),
    read('docs/architecture/PUBLIC-DISCOVERY-EXPERIENCE-BLUEPRINT.md')
  ]);

  assert.match(searchPage, /nextState\.tab !== 'professional'/);
  assert.match(searchPage, /nextTab === 'professional' \? '' : categoryCode/);
  assert.match(searchPage, /tab !== 'professional' && <div className=\{styles\.field\}><label htmlFor="category">/);
  assert.match(searchPage, /بحث المهنيين متاح بالكلمة والمدينة/);
  assert.match(mvpDefinition, /Professional discovery remains a separate keyword-and-location search/);
  assert.match(taxonomy, /Professional Profiles remain discoverable only through their separate keyword-and-governed-location search/);
  assert.match(blueprint, /Professional tab must hide and clear the Category filter/);
});

test('service discovery applies the selected governed city through its public owner', async () => {
  const [repository, service, combinedSearch, controller, request, client, page] = await Promise.all([
    read('apps/backend/src/service-catalog/service-catalog.repository.ts'),
    read('apps/backend/src/service-catalog/service-catalog.service.ts'),
    read('apps/backend/src/search/search.service.ts'),
    read('apps/backend/src/service-catalog/service-catalog.controller.ts'),
    read('apps/backend/src/service-catalog/dto/service-catalog.dto.ts'),
    read('apps/frontend/lib/api-client.ts'),
    read('apps/frontend/app/search/page.tsx')
  ]);

  assert.match(repository, /bp\.city_code = \$\$\{params\.length\}/);
  assert.match(repository, /pp\.city_code = \$\$\{params\.length\}/);
  assert.match(service, /cityCode: input\.cityCode/);
  assert.match(combinedSearch, /cityCode: input\.cityCode/);
  assert.match(controller, /@Query\('cityCode'\) cityCode/);
  assert.match(request, /readonly cityCode\?: unknown/);
  assert.match(client, /services\/search\?\$\{qs\}/);
  assert.match(page, /api\.services\.search\(\{[\s\S]*cityCode: next\.cityCode/);
});
