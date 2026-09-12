import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('EO-009 pages exist with Arabic-first labels and loading/error states', async () => {
  const businessProfiles = await read('app/business-profiles/page.tsx');
  const professionalProfiles = await read('app/professional-profiles/page.tsx');
  const serviceCatalog = await read('app/components/category-directory.tsx');
  const locations = await read('app/locations/page.tsx');
  const search = await read('app/search/page.tsx');
  const primitives = await read('app/components/ui-primitives.tsx');

  assert.match(businessProfiles, /ملفات الأعمال/);
  assert.match(professionalProfiles, /title="ملفي المهني"/);
  assert.match(professionalProfiles, /api\.professionals\.getMine\(\)/);
  assert.match(serviceCatalog, /دليل الخدمات/);
  assert.match(locations, /redirect\(legacyDiscoveryHref\('\/map', await searchParams\)\)/);
  assert.match(search, /البحث/);

  assert.match(businessProfiles, /StatusMessage tone="danger"/);
  assert.match(professionalProfiles, /import\s*\{[^}]*\bStatusMessage\b[^}]*\}\s*from '\.\.\/components\/ui-primitives'/);
  assert.match(professionalProfiles, /\{error && <StatusMessage tone="danger">\{error\}<\/StatusMessage>\}/);
  assert.match(primitives, /export function StatusMessage\([\s\S]*?return <div[^>]*role=\{tone === 'danger' \? 'alert' : 'status'\}/);
  assert.match(professionalProfiles, /SkeletonGrid count=\{2\} label="جاري تحميل ملفك المهني"/);
  assert.match(serviceCatalog, /SkeletonGrid label="جاري تحميل الخدمات"/);
  assert.match(search, /aria-busy/);
  assert.match(serviceCatalog, /StatusMessage tone="danger"/);
  assert.match(search, /role="alert"/);
});

test('EO-009 navigation is wired from main and admin surfaces', async () => {
  const home = await read('app/page.tsx');
  const admin = await read('app/admin/page.tsx');

  assert.match(home, /<form action="\/search"/);
  assert.match(home, /href: '\/food'/);
  assert.match(home, /href: '\/mobility\?type=delivery'/);
  assert.match(home, /href: '\/taxi'/);
  assert.match(home, /href="\/store"/);
  assert.match(home, /href="\/auth\/register"/);

  for (const href of ['/admin/moderation', '/categories', '/admin/operations-product']) assert.match(admin, new RegExp(`href=\\"${href}\\"`));
  assert.match(admin, /api\.operationsProduct\.overview\(\)/);
  assert.match(admin, /canManageModeration \? <Link href="\/admin\/moderation"/);
  assert.match(admin, /overview\.permissions\.includes\('security\.manage'\)/);
  assert.doesNotMatch(admin, /organizations|منظمات/);
});

test('EO-009 frontend API client exposes integration endpoints', async () => {
  const client = await read('lib/api-client.ts');

  assert.match(client, /businesses:/);
  assert.match(client, /professionals:/);
  assert.match(client, /services:/);
  assert.match(client, /locations:/);
  assert.match(client, /search:/);

  assert.match(client, /\/businesses\/my/);
  assert.match(client, /\/professionals\/me/);
  assert.match(client, /\/services\/search/);
  assert.match(client, /\/locations\/cities/);
  assert.match(client, /\/search\?/);
});