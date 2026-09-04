import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('root layout declares Arabic RTL defaults and metadata', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(layout, /منصة عربية لاكتشاف الأعمال والمهنيين والخدمات الموثوقة/);
  assert.match(layout, /الانتقال إلى المحتوى/);
});

test('global styles preserve RTL and accessibility focus foundations', async () => {
  const styles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8');
  const brand = await readFile(new URL('../app/brand-system.css', import.meta.url), 'utf8');

  assert.match(styles, /direction:\s*rtl/);
  assert.match(styles, /\.skip-link:focus/);
  assert.match(styles, /outline:\s*3px solid var\(--focus\)/);
  assert.match(tokens, /--k-font-arabic:/);
  assert.match(tokens, /--k-leading-body:\s*1\.75/);
  assert.match(tokens, /button,input,select,textarea\s*\{\s*font-family:inherit/);
  assert.match(tokens, /unicode-bidi:isolate/);
  assert.match(brand, /font-family:var\(--k-font-arabic\)/);
});

test('frontend prepares global error and loading boundaries only', async () => {
  const errorBoundary = await readFile(new URL('../app/error.tsx', import.meta.url), 'utf8');
  const loading = await readFile(new URL('../app/loading.tsx', import.meta.url), 'utf8');

  assert.match(errorBoundary, /role="alert"/);
  assert.match(errorBoundary, /حدث خطأ غير متوقع دون عرض أي معلومات داخلية/);
  assert.match(loading, /aria-busy="true"/);
});
