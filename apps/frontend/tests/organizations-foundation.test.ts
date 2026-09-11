import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('legacy organization creation redirects to the unified business workspace', async () => {
  const list = await readFile(new URL('../app/organizations/page.tsx', import.meta.url), 'utf8');
  const create = await readFile(new URL('../app/organizations/new/page.tsx', import.meta.url), 'utf8');
  const details = await readFile(new URL('../app/organizations/[id]/page.tsx', import.meta.url), 'utf8');

  assert.match(list, /المؤسسات والجهات/);
  // Preserve access to existing organizations without advertising retired creation.
  assert.match(list, /api\.organizations\.listMine\(\)/);
  assert.match(list, /إنشاء جهات جديدة غير متاح في الإصدار الحالي/);
  assert.match(list, /href="\/business-profiles"/);
  assert.ok(list.includes('href={`/organizations/${organization.id}`}'));
  assert.doesNotMatch(list, /href="\/organizations\/new"|api\.organizations\.create\(/);
  assert.match(create, /redirect\('\/business-profiles'\)/);
  assert.match(details, /إدارة الجهة/);
  assert.match(list, /SkeletonGrid/);
  assert.match(details, /StatusMessage tone="success"/);
});
