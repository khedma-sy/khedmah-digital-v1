import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public professional profile uses the shared Khedmah visual system', async () => {
  const page = await read('apps/frontend/app/professional-profiles/[id]/page.tsx');
  const css = await read('apps/frontend/app/professional-profiles/[id]/professional-profile.module.css');

  for (const primitive of ['PageShell', 'Surface', 'StatusMessage', 'EmptyState', 'ActionButton']) {
    assert.match(page, new RegExp(`\\b${primitive}\\b`));
  }
  for (const token of ['--k-color-canvas', '--k-color-primary', '--k-color-brand', '--k-color-surface']) {
    assert.match(css, new RegExp(token));
  }
  assert.doesNotMatch(page, /style=\{/);
  assert.doesNotMatch(page, /#e0f2fe|#bae6fd|#0369a1|👤|📍|✅|❌|⏳|📋/);
});

test('professional profile renders only real API data and complete public actions', async () => {
  const page = await read('apps/frontend/app/professional-profiles/[id]/page.tsx');

  assert.match(page, /api\.professionals\.getProfile/);
  assert.match(page, /api\.services\.listForOwner/);
  assert.match(page, /api\.professionals\.getMedia/);
  assert.match(page, /ContactInquiryForm/);
  assert.match(page, /ProviderReportForm/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /profile\.contactEligibility\?\.eligible/);
  assert.doesNotMatch(page, /Khedmah Production Test|pending → approved|localStorage|Math\.random/);
});

test('professional page states and layout adapt to mobile and dark theme tokens', async () => {
  const page = await read('apps/frontend/app/professional-profiles/[id]/page.tsx');
  const css = await read('apps/frontend/app/professional-profiles/[id]/professional-profile.module.css');

  assert.match(page, /جاري تحميل الملف المهني/);
  assert.match(page, /تعذر فتح الملف المهني/);
  assert.match(page, /لم تُضف خدمات بعد/);
  assert.match(css, /@media\(max-width:52rem\)/);
  assert.match(css, /@media\(max-width:38rem\)/);
  assert.doesNotMatch(css, /var\(--muted\)|var\(--surface\)|var\(--border\)/);
});
