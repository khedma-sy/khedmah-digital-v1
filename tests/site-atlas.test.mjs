import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const atlasPath = join(root, 'docs/operations/SITE-ATLAS.md');
async function pages(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await pages(path));
    else if (entry.isFile() && entry.name === 'page.tsx') found.push(relative(root, path).split('\\').join('/'));
  }
  return found;
}

test('site atlas names the actual owning file of every Web page entry, including compatibility redirects', async () => {
  const atlas = await readFile(atlasPath, 'utf8');
  const entries = await pages(join(root, 'apps/frontend/app'));
  assert.ok(entries.length > 0);
  for (const path of entries) assert.ok(atlas.includes(`](../../${path})`), `missing page owner: ${path}`);
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
