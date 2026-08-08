import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('organization screens render Arabic-first labels and loading states', async () => {
  const list = await readFile(new URL('../app/organizations/page.tsx', import.meta.url), 'utf8');
  const create = await readFile(new URL('../app/organizations/new/page.tsx', import.meta.url), 'utf8');
  const details = await readFile(new URL('../app/organizations/[id]/page.tsx', import.meta.url), 'utf8');

  assert.match(list, /مساحة الأعمال/);
  assert.match(list, /تجمع فريقك وملفات أعمالك/);
  assert.match(create, /إنشاء منظمة/);
  assert.match(details, /تفاصيل المنظمة/);
  assert.match(list, /aria-busy/);
  assert.match(create, /role="alert"/);
  assert.match(details, /role="status"/);
});
