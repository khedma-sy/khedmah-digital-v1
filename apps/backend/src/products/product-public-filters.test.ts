import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { validateProductPublicFilters } from './product.validation';

test('public filter validation preserves the recovered Store contract without accepting unsafe price sorting', () => {
  assert.deepEqual(validateProductPublicFilters({ availability: 'in_stock', currency: 'SYP', minPrice: '100', maxPrice: '500', sort: 'price_asc' }), {
    q: undefined, categoryCode: undefined, cityCode: undefined, businessProfileId: undefined,
    availability: 'in_stock', currency: 'SYP', minPrice: 100, maxPrice: 500, sort: 'price_asc'
  });
  assert.throws(() => validateProductPublicFilters({ minPrice: '10' }), BadRequestException);
  assert.throws(() => validateProductPublicFilters({ currency: 'SYP', minPrice: '500', maxPrice: '100' }), BadRequestException);
  assert.throws(() => validateProductPublicFilters({ sort: 'DROP TABLE product_listings' }), BadRequestException);
  assert.throws(() => validateProductPublicFilters({ cityCode: 'not-a-syrian-city' }), BadRequestException);
});

test('public discovery applies availability and price filters with an allowlisted order', async () => {
  let query = '';
  let params: unknown[] = [];
  const database = {
    query: async (sql: string, values: unknown[]) => { query = sql; params = values; return []; }
  };
  const repository = new ProductRepository(database as never);
  assert.deepEqual(await repository.listPublic({ availability: 'in_stock', currency: 'SYP', minPrice: 100, maxPrice: 500, sort: 'price_asc' }), []);
  assert.match(query, /p\.availability=\$1/);
  assert.match(query, /p\.currency=\$2/);
  assert.match(query, /p\.price >= \$3/);
  assert.match(query, /p\.price <= \$4/);
  assert.match(query, /ORDER BY p\.price ASC, p\.created_at DESC LIMIT 100/);
  assert.deepEqual(params, ['in_stock', 'SYP', 100, 500]);
});
