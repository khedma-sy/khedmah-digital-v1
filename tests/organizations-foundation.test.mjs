import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('organization backend exposes only approved organization endpoints', async () => {
  const controller = await read('apps/backend/src/organizations/organizations.controller.ts');

  assert.match(controller, /@Post\(\)/);
  assert.match(controller, /@Get\('my'\)/);
  assert.match(controller, /@Get\(':id'\)/);
  assert.match(controller, /@Patch\(':id'\)/);
  assert.match(controller, /@Get\(':id\/members'\)/);
  assert.match(controller, /@Post\(':id\/members'\)/);
  assert.match(controller, /@Patch\(':id\/members\/:memberId'\)/);
  assert.match(controller, /@Delete\(':id\/members\/:memberId'\)/);
});

test('organization database SQL creates only approved organization tables and reuses audit logs', async () => {
  const sql = await read('infra/database/002_organizations_foundation.sql');
  const tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]).sort();

  assert.deepEqual(tables, ['organization_members', 'organizations']);
  assert.match(sql, /audit_logs/);
  assert.doesNotMatch(sql, /business_profiles|categories|locations|marketplace|payments|messaging|analytics/i);
});

test('legacy organization creation redirects while existing data remains readable', async () => {
  const list = await read('apps/frontend/app/organizations/page.tsx');
  const create = await read('apps/frontend/app/organizations/new/page.tsx');
  const details = await read('apps/frontend/app/organizations/[id]/page.tsx');

  assert.match(list, /مساحة الأعمال/);
  assert.match(list, /تجمع فريقك وملفات أعمالك/);
  assert.match(create, /redirect\('\/business-profiles'\)/);
  assert.match(details, /إدارة الجهة/);
  assert.doesNotMatch(`${list}\n${create}\n${details}`, /business profile|marketplace|payments|messaging|analytics/i);
});
