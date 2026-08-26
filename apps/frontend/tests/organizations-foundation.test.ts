import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('organization screens render Arabic-first labels and loading states', async () => {
  const list = await readFile(new URL('../app/organizations/page.tsx', import.meta.url), 'utf8');
  const create = await readFile(new URL('../app/organizations/new/page.tsx', import.meta.url), 'utf8');
  const details = await readFile(new URL('../app/organizations/[id]/page.tsx', import.meta.url), 'utf8');

  assert.match(list, /المؤسسات والجهات/);
  assert.match(list, /نظّم فريقك وملفات الأعمال/);
  assert.match(create, /إنشاء مؤسسة أو جهة/);
  assert.match(details, /إدارة الجهة/);
  assert.match(list, /SkeletonGrid/);
  assert.match(create, /StatusMessage tone="danger"/);
  assert.match(details, /StatusMessage tone="success"/);
});
