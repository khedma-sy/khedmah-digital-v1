import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('owned business profiles lead to the focused provider workspace', async () => {
  const profiles = await read('../app/business-profiles/page.tsx');
  const manage = await read('../app/business-profiles/[id]/manage/page.tsx');

  assert.match(profiles, /\/business-profiles\/\$\{profile\.id\}\/manage/);
  assert.match(manage, /إضافة خدمة/);
  assert.match(manage, /api\.services\.listForOwner/);
  assert.match(manage, /api\.services\.create/);
  assert.match(manage, /api\.services\.update/);
});

test('provider workspace lists real received inquiries without chat or booking', async () => {
  const manage = await read('../app/business-profiles/[id]/manage/page.tsx');
  const client = await read('../lib/api-client.ts');

  assert.match(manage, /الاستفسارات الواردة/);
  assert.match(manage, /api\.businesses\.listReceivedInquiries/);
  assert.match(client, /`\/businesses\/\$\{id\}\/inquiries`/);
  assert.doesNotMatch(manage, /chat|booking|payment|marketplace/i);
});

test('provider core remains mobile-first with one primary and two secondary paths', async () => {
  const manage = await read('../app/business-profiles/[id]/manage/page.tsx');
  const styles = await read('../app/business-profiles/[id]/manage/provider-core.module.css');

  assert.equal((manage.match(/className=\{styles\.secondaryActions\}/g) ?? []).length, 1);
  assert.match(styles, /@media\(min-width:48rem\)/);
  assert.match(styles, /@media\(max-width:26rem\)/);
});

test('provider edit control preserves a current non-selectable legacy category', async () => {
  const manage = await read('../app/business-profiles/[id]/manage/page.tsx');

  assert.match(manage, /hasSelectableCurrentCategory/);
  assert.match(manage, /<option value=\{profileForm\.categoryCode\}>التصنيف الحالي المحفوظ \(قديم\)<\/option>/);
  assert.match(manage, /يمكنك إبقاء التصنيف الحالي عند تعديل معلومات أخرى/);
});
