import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('official founder profile presents the approved Khedmah name and its platform role', async () => {
  const page = await read('app/business-profiles/khedmah-digital/page.tsx');
  const home = await read('app/page.tsx');

  assert.match(home, /FeaturedCategories/);
  assert.match(home, /khedma-community\.webp/);
  assert.match(page, /nameAr: 'خدمة'/);
  assert.doesNotMatch(page, /خدمة ديجتل|KHEDMA DIGITAL/);
  assert.match(page, /المنصة الرسمية لخدمة/);
  assert.match(page, /منصة رقمية تجمع الأعمال والمهنيين ومقدمي الخدمات تحت مظلة واحدة/);
  assert.match(page, /اكتشاف الأعمال/);
  assert.match(page, /ملفات المهنيين/);
  assert.match(page, /دليل الخدمات/);
});

test('founder showcase supports identity media, partners, contact, and sharing', async () => {
  const showcase = await read('app/components/company-showcase.tsx');
  const shareAction = await read('app/components/share-action.tsx');

  assert.match(showcase, /logoUrl/);
  assert.match(showcase, /coverUrl/);
  assert.match(showcase, /انضم كشريك/);
  assert.match(showcase, /تواصل مع خدمة/);
  assert.doesNotMatch(showcase, /خدمة ديجتل|أنا مع خدمة/);
  assert.match(showcase, /<ShareAction/);
  assert.match(shareAction, /navigator\.share/);
  assert.match(shareAction, /navigator\.clipboard\.writeText/);
  assert.match(showcase, /href="\/business-profiles\/new"/);
  assert.match(showcase, /href="\/professional-profiles\/new"/);
});
