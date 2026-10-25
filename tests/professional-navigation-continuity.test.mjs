import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('signed-in navigation exposes the professional workspace without removing existing account routes', async () => {
  const source = await read('apps/frontend/app/auth-navigation.tsx');
  assert.match(source, /href="\/professional-profiles">ملفي المهني/);
  assert.match(source, /href="\/business-profiles">أعمالي/);
  assert.match(source, /href="\/users\/me"/);
});

test('nearby discovery truthfully bridges to city-based professional search instead of pretending professionals are mapped', async () => {
  const source = await read('apps/frontend/app/map/page.tsx');
  assert.match(source, /type:\s*'business'/, 'map results remain bounded to providers with supported map coordinates');
  assert.match(source, /tab:\s*'professional'/);
  assert.match(source, /categoryCode:\s*''/);
  assert.match(source, /ابحث عن مهنيين في المدينة/);
});
