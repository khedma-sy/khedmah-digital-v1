import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('legacy organization creation redirects to the unified business workspace', async () => {
  const list = await readFile(new URL('../app/organizations/page.tsx', import.meta.url), 'utf8');
  const create = await readFile(new URL('../app/organizations/new/page.tsx', import.meta.url), 'utf8');
  const details = await readFile(new URL('../app/organizations/[id]/page.tsx', import.meta.url), 'utf8');

  assert.match(list, /المؤسسات والجهات/);
  assert.match(list, /تجمع فريقك وملفات أعمالك/);
  assert.match(create, /redirect\('\/business-profiles'\)/);
  assert.match(details, /إدارة الجهة/);
  assert.match(list, /SkeletonGrid/);
  assert.match(details, /StatusMessage tone="success"/);
});
