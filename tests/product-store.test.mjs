import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('migration 024 creates a moderated listing store without checkout or order tables', async () => {
  const [migration, rollback] = await Promise.all([
    read('backend/migrations/versions/024_product_store.sql'),
    read('backend/migrations/versions/024_product_store_rollback.sql')
  ]);
  assert.match(migration, /CREATE TABLE product_listings/);
  assert.match(migration, /REFERENCES business_profiles\(id\)/);
  assert.match(migration, /REFERENCES categories\(code\)/);
  assert.match(migration, /moderation_status/);
  assert.match(migration, /product_listing/);
  assert.match(migration, /product_image/);
  assert.doesNotMatch(migration, /CREATE TABLE (?:orders?|payments?|carts?|inventory)/i);
  assert.match(rollback, /DROP TABLE product_listings/);
});

test('public product reads fail closed when the seller business is not publicly eligible', async () => {
  const [repository, service, validation, controller] = await Promise.all([
    read('apps/backend/src/products/product.repository.ts'),
    read('apps/backend/src/products/product.service.ts'),
    read('apps/backend/src/products/product.validation.ts'),
    read('apps/backend/src/products/product.controller.ts')
  ]);
  for (const condition of [
    "b.visibility='public'",
    "b.moderation_status='approved'",
    "b.trust_status='approved'",
    "b.status='active'"
  ]) assert.match(repository, new RegExp(condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(service, /repository\.findPublicById/);
  assert.match(service, /toPublicProduct/);
  assert.match(service, /ownerUserId: _ownerUserId/);
  assert.match(service, /rejectionReason: _rejectionReason/);
  assert.match(service, /business\.ownerUserId !== actor\.id/);
  assert.match(service, /hasPublicImage/);
  assert.match(service, /Seller business must be public, approved, trusted, and active/);
  assert.match(service, /security\.manage/);
  assert.match(service, /status !== 'approved' && status !== 'rejected'/);
  assert.match(service, /validateProductPublicFilters/);
  assert.match(validation, /currency is required for price filtering or sorting/);
  assert.match(validation, /minPrice cannot exceed maxPrice/);
  assert.match(validation, /sort is invalid/);
  assert.match(controller, /@Query\('availability'\)/);
  assert.match(controller, /@Query\('minPrice'\)/);
  assert.match(controller, /@Query\('maxPrice'\)/);
  assert.match(controller, /@Query\('sort'\)/);
  assert.match(repository, /p\.availability=\$/);
  assert.match(repository, /p\.currency=\$/);
  assert.match(repository, /p\.price >= \$/);
  assert.match(repository, /p\.price <= \$/);
  assert.match(repository, /p\.price ASC, p\.created_at DESC/);
});

test('product image ownership and media type are enforced by the canonical media service', async () => {
  const [types, validation, service] = await Promise.all([
    read('apps/backend/src/media/media.types.ts'),
    read('apps/backend/src/media/media.validation.ts'),
    read('apps/backend/src/media/media.service.ts')
  ]);
  assert.match(types, /product_listing/);
  assert.match(types, /product_image/);
  assert.match(validation, /ownerType === 'product_listing'/);
  assert.match(validation, /assetType !== 'product_image'/);
  assert.match(service, /ownerType === 'product_listing' \? 'product_listings'/);
  assert.match(service, /input\.assetType === 'gallery' \? 12/);
  assert.match(service, /input\.assetType === 'product_image' \? 5/);
});
