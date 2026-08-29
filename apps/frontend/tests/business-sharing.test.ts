import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public business profile exposes explicit WhatsApp and copy-link actions', async () => {
  const page = await readFile(new URL('../app/business-profiles/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /https:\/\/wa\.me\/\?text=/);
  assert.match(page, /مشاركة عبر واتساب/);
  assert.match(page, /navigator\.clipboard\.writeText\(window\.location\.href\)/);
  assert.match(page, /نسخ رابط النشاط/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /مشاركة عبر الجهاز/);
});

test('home empty state uses direct discovery language without the ambiguous waiting message', async () => {
  const recent = await readFile(new URL('../app/components/recently-added.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(recent, /بانتظار أول نشاط موثّق|ستظهر هنا الأنشطة المنشورة/);
  assert.match(recent, /فتح صفحة الإعلانات المبوبة/);
});
