import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('category admin is a soft-state taxonomy surface, never a destructive delete API',async()=>{
  const controller=await read('apps/backend/src/categories/category-admin.controller.ts');
  const service=await read('apps/backend/src/categories/category-admin.service.ts');
  const repository=await read('apps/backend/src/categories/category.repository.ts');
  assert.match(controller,/Controller\('admin\/categories'\)/);
  assert.match(controller,/@Patch\(':code'\)/);
  assert.doesNotMatch(controller,/@Delete/);
  assert.match(service,/category_admin/);
  assert.match(service,/bootstrap_admin/);
  assert.match(service,/cannot contain cycles/);
  assert.match(service,/Deactivate active child categories first/);
  assert.match(repository,/status='active'/);
  assert.doesNotMatch(repository,/DELETE\s+FROM\s+categories/i);
});

test('category code stays immutable while display, hierarchy, feature and order fields remain editable',async()=>{
  const service=await read('apps/backend/src/categories/category-admin.service.ts');
  const page=await read('apps/frontend/app/admin/categories/page.tsx');
  assert.match(service,/const next:Category=\{/);
  assert.match(service,/code,/);
  for(const field of ['nameAr','parentCode','visualKey','isFeatured','status','sortOrder']) assert.match(service,new RegExp(field));
  assert.match(page,/Taxonomy Control/);
  assert.match(page,/شجرة التصنيفات/);
  assert.match(page,/تعطيل/);
});
