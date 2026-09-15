import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('restaurant discovery keeps server-owned query/category pagination and visible total progress', async () => {
  const page = await read('app/restaurants/page.tsx');

  assert.match(page, /api\.businesses\.search\(\{[\s\S]*q: deferredQuery \|\| undefined,[\s\S]*categoryCode,[\s\S]*page,/);
  assert.match(page, /setPage\(\(current\) => current \+ 1\)/);
  assert.match(page, /businesses\.length < total/);
  assert.match(page, /businesses\.length\.toLocaleString[\s\S]*من[\s\S]*total\.toLocaleString/);
  assert.match(page, /إعادة تحميل الصفحة الحالية/);
  assert.match(page, /Promise\.allSettled\(/);
});

test('restaurant partial failures remain retryable and never silently advance past a failed page', async () => {
  const page = await read('app/restaurants/page.tsx');

  assert.match(page, /setPartialFailure\(rejected\.length > 0\)/);
  assert.match(page, /partialFailure[\s\S]*setRetryToken\(\(token\) => token \+ 1\)/);
  assert.match(page, /const hasMore = !partialFailure && businesses\.length < total/);
  assert.match(page, /تم تحميل نتائج جزئية\. أعد محاولة الصفحة الحالية قبل متابعة بقية المطاعم/);
});

test('restaurant journey inherits canonical Food section identity and avoids white copy on the bright orange command surface', async () => {
  const layout = await read('app/restaurants/layout.tsx');
  const css = await read('app/restaurants/restaurants.module.css');

  assert.match(layout, /data-khedmah-section="food"/);
  assert.match(css, /--food-orange: #fd9603/);
  assert.match(css, /\.foodCommand[\s\S]*color: var\(--k-color-text\)/);
  assert.match(css, /\.foodCommand \.toolbarIcon \{ color: var\(--k-color-on-accent\); background: var\(--food-orange\); \}/);
  assert.match(css, /\.foodCommand \.filters button\[aria-pressed="true"\][\s\S]*color: var\(--k-color-on-accent\); background: var\(--food-orange\)/);
  assert.doesNotMatch(css, /\.foodCommand[^}]*color:\s*#fff[^}]*background:\s*linear-gradient\([^)]*var\(--food-orange\)/s);
});
