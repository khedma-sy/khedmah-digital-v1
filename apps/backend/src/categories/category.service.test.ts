import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoryService } from './category.service';

const active = { code: 'maintenance', nameAr: 'الصيانة', visualKey: 'home', isFeatured: false, status: 'active' as const, sortOrder: 1 };

test('Category API authority lists and resolves active canonical categories', async () => {
  const repository = { listActive: async () => [active], findActiveByCode: async (code: string) => code === active.code ? active : undefined, hasActiveChildren: async () => false };
  const service = new CategoryService(repository as never);
  assert.deepEqual(await service.listActive(), [active]);
  assert.deepEqual(await service.getActive('maintenance'), active);
});

test('Category authority rejects malformed, inactive, and unknown codes', async () => {
  const repository = { listActive: async () => [], findActiveByCode: async () => undefined, hasActiveChildren: async () => false };
  const service = new CategoryService(repository as never);
  await assert.rejects(() => service.assertActiveCategory('Not Canonical'), BadRequestException);
  await assert.rejects(() => service.assertActiveCategory('inactive'), BadRequestException);
  await assert.rejects(() => service.getActive('unknown'), NotFoundException);
});

test('Category writes reject a root category that has active children', async () => {
  const repository = { listActive: async () => [active], findActiveByCode: async () => active, hasActiveChildren: async () => true };
  const service = new CategoryService(repository as never);
  await assert.rejects(() => service.assertActiveCategory(active.code), BadRequestException);
});

test('Category discovery accepts an active root category', async () => {
  const repository = { listActive: async () => [active], findActiveByCode: async () => active, hasActiveChildren: async () => true };
  const service = new CategoryService(repository as never);
  assert.equal(await service.assertActiveCategoryFilter(active.code), active.code);
});
