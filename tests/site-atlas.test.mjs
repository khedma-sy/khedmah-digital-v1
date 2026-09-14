import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const atlasPath = join(root, 'docs/operations/SITE-ATLAS.md');
const taxiSupplementPath = join(root, 'docs/decisions/RP35-TAXI-UI.md');
const foodSupplementPath = join(root, 'docs/decisions/RP36-FOOD-UI.md');
const fulfillmentSupplementPath = join(root, 'docs/decisions/RP37-FULFILLMENT-UI.md');
const categoryAdminSupplementPath = join(root, 'docs/decisions/RP38-CATEGORY-ADMIN-UI.md');
const koraAdminSupplementPath = join(root, 'docs/decisions/RP39-KORA-ADMIN-UI.md');
const taxiDriverOpsSupplementPath = join(root, 'docs/decisions/RP40-TAXI-DRIVER-OPS-UI.md');
const fulfillmentPages = [
  'apps/frontend/app/orders/checkout/page.tsx',
  'apps/frontend/app/orders/courier/page.tsx',
  'apps/frontend/app/orders/merchant/page.tsx',
  'apps/frontend/app/orders/page.tsx',
  'apps/frontend/app/restaurants/[businessId]/page.tsx',
  'apps/frontend/app/restaurants/page.tsx'
];
const categoryAdminPage = 'apps/frontend/app/admin/categories/page.tsx';
const koraAdminPage = 'apps/frontend/app/admin/kora/page.tsx';
const taxiDriverOpsPage = 'apps/frontend/app/admin/taxi-drivers/page.tsx';
const taxiPages = ['apps/frontend/app/taxi/page.tsx', 'apps/frontend/app/taxi-driver-signup/page.tsx'];
async function pages(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await pages(path));
    else if (entry.isFile() && entry.name === 'page.tsx') found.push(relative(root, path).split('\\').join('/'));
  }
  return found;
}

test('site atlas names every Web page owner; newly bound launch pages require exact narrow supplements', async () => {
  const [atlas, taxiSupplement, foodSupplement, fulfillmentSupplement, categoryAdminSupplement, koraAdminSupplement, taxiDriverOpsSupplement] = await Promise.all([
    readFile(atlasPath, 'utf8'), readFile(taxiSupplementPath, 'utf8'), readFile(foodSupplementPath, 'utf8'), readFile(fulfillmentSupplementPath, 'utf8'), readFile(categoryAdminSupplementPath, 'utf8'), readFile(koraAdminSupplementPath, 'utf8'), readFile(taxiDriverOpsSupplementPath, 'utf8')
  ]);
  const entries = await pages(join(root, 'apps/frontend/app'));
  assert.ok(entries.length > 0);
  const missingFromAtlas = entries.filter(path => !atlas.includes(`](../../${path})`)).sort();
  assert.deepEqual(missingFromAtlas,[categoryAdminPage,koraAdminPage,taxiDriverOpsPage,'apps/frontend/app/food/page.tsx',...fulfillmentPages,...taxiPages].sort(),'no page other than explicitly supplemented launch, fulfillment and Product V2 admin pages may bypass the primary atlas');
  for (const page of taxiPages) assert.ok(taxiSupplement.includes(`](../../${page})`), `Taxi supplement must name exact page owner: ${page}`);
  assert.ok(foodSupplement.includes('](../../apps/frontend/app/food/page.tsx)'));
  for (const page of fulfillmentPages) assert.ok(fulfillmentSupplement.includes(`](../../${page})`), `Fulfillment supplement must name exact page owner: ${page}`);
  assert.ok(categoryAdminSupplement.includes(`](../../${categoryAdminPage})`));
  assert.ok(koraAdminSupplement.includes(`](../../${koraAdminPage})`));
  assert.ok(taxiDriverOpsSupplement.includes(`](../../${taxiDriverOpsPage})`));
  for (const supplement of [taxiSupplement, foodSupplement, fulfillmentSupplement, categoryAdminSupplement, koraAdminSupplement, taxiDriverOpsSupplement]) assert.match(supplement, /narrow bridge, not a general documentation waiver/i);
  const routeHeadings = [...atlas.matchAll(/^#### `([^`]+)`/gm)].map((match) => match[1]);
  assert.equal(new Set(routeHeadings).size, routeHeadings.length, 'each page specification appears once');
});

test('atlas local references resolve and README has one stable owner-facing entry', async () => {
  const atlas = await readFile(atlasPath, 'utf8');
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  for (const [, link] of atlas.matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(!/^[a-z]+:/i.test(link), 'atlas source references stay repository-relative');
    const target = resolve(dirname(atlasPath), link);
    const relation = relative(root, target);
    assert.ok(!relation.startsWith('..'), 'reference must stay within repository');
    await access(target);
  }
  assert.equal((readme.match(/\]\(docs\/operations\/SITE-ATLAS\.md\)/g) ?? []).length, 1);
  for (const retained of ['PLATFORM-CONSTITUTION.md', 'KHEDMAH-DIGITAL-MVP-DEFINITION.md', 'DEFINITION-OF-DONE.md']) assert.ok(readme.includes(retained));
});
