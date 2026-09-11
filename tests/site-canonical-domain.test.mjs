import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const files = await Promise.all([
  read('../apps/frontend/app/layout.tsx'),
  read('../apps/frontend/app/page.tsx'),
  read('../apps/frontend/app/robots.ts'),
  read('../apps/frontend/app/sitemap.ts'),
  read('../.env.example')
]);

test('public canonical origin is the approved UK domain across metadata surfaces', () => {
  for (const source of files) {
    assert.doesNotMatch(source, /https:\/\/khedmah\.digital/);
  }
  assert.match(files[0], /https:\/\/khedmah\.uk/);
  assert.match(files[1], /https:\/\/khedmah\.uk/);
  assert.match(files[2], /https:\/\/khedmah\.uk/);
  assert.match(files[3], /https:\/\/khedmah\.uk/);
  assert.match(files[4], /NEXT_PUBLIC_SITE_URL=https:\/\/khedmah\.uk/);
  assert.match(files[4], /EMAIL_FROM=noreply@mail\.khedmah\.uk/);
});

test('principal public title remains Khedmah Digital in Arabic', () => {
  assert.match(files[0], /const SITE_NAME = 'خدمة ديجتل'/);
  assert.match(files[1], /title: 'خدمة ديجتل - كل ما تحتاجه أقرب إليك'/);
});
