import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('EO-009 pages exist with Arabic-first labels and loading/error states', async () => {
  const businessProfiles = await read('app/business-profiles/page.tsx');
  const professionalProfiles = await read('app/professional-profiles/page.tsx');
  const serviceCatalog = await read('app/service-catalog/page.tsx');
  const locations = await read('app/locations/page.tsx');
  const search = await read('app/search/page.tsx');

  assert.match(businessProfiles, /ملفات الأعمال/);
  assert.match(professionalProfiles, /الملفات المهنية/);
  assert.match(serviceCatalog, /دليل الخدمات/);
  assert.match(locations, /المواقع/);
  assert.match(search, /البحث/);

  assert.match(businessProfiles, /role="alert"/);
  assert.match(professionalProfiles, /role="alert"/);
  assert.match(serviceCatalog, /aria-busy/);
  assert.match(locations, /aria-busy/);
  assert.match(search, /aria-busy/);
  assert.match(serviceCatalog, /role="alert"/);
  assert.match(locations, /role="alert"/);
  assert.match(search, /role="alert"/);
});

test('EO-009 navigation is wired from main and admin surfaces', async () => {
  const home = await read('app/page.tsx');
  const organizations = await read('app/organizations/page.tsx');
  const admin = await read('app/admin/page.tsx');

  assert.match(home, /action="\/search"/);
  assert.match(home, /href=\{`\/service-catalog\?category=\$\{category\}`\}/);
  assert.match(home, /name="cityCode"/);

  for (const href of ['/business-profiles', '/professional-profiles', '/service-catalog', '/locations', '/search']) {
    assert.match(organizations, new RegExp(`href=\\"${href}\\"`));
    assert.match(admin, new RegExp(`href=\\"${href}\\"`));
  }
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
