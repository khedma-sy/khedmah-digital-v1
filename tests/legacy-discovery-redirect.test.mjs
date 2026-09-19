import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = readFileSync(new URL(`../apps/frontend/${path}`, import.meta.url), 'utf8');
  const exports = {};
  new Script(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)
    .runInContext(createContext({ exports, URLSearchParams, require(id) {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Unexpected dependency: ${id}`);
    } }));
  return exports;
}
const helper = load('lib/legacy-discovery-redirect.ts');
async function redirectFrom(route, query) {
  let destination;
  const page = load(`app/${route}/page.tsx`, {
    '../../lib/legacy-discovery-redirect': helper,
    'next/navigation': { redirect(href) { destination = href; } }
  });
  await page.default({ searchParams: Promise.resolve(query) });
  assert.ok(destination, 'actual page delegates to Next redirect');
  return new URL(destination, 'https://fixture.example.test');
}
for (const [route, target] of [['service-catalog','/categories'], ['locations','/map']]) {
  test(`${route} preserves supported context and encodes values without an external redirect`, async () => {
    const url = await redirectFrom(route, { q: 'صيانة & https://other.test', cityCode: 'aleppo', category: 'plumber', categoryCode: '', page: '2', returnTo: 'https://other.test', token: 'discard' });
    assert.equal(url.pathname, target); assert.equal(url.origin, 'https://fixture.example.test');
    assert.equal(url.searchParams.get('q'), 'صيانة & https://other.test'); assert.equal(url.searchParams.get('cityCode'), 'aleppo');
    assert.equal(url.searchParams.get('category'), 'plumber'); assert.equal(url.searchParams.get('categoryCode'), '');
    assert.equal(url.searchParams.get('page'), target === '/categories' ? '2' : null);
    assert.equal(url.searchParams.get('returnTo'), null); assert.equal(url.searchParams.get('token'), null);
  });
  test(`${route} without filters retains its existing destination`, async () => {
    assert.equal((await redirectFrom(route, undefined)).pathname, target);
    assert.equal((await redirectFrom(route, {})).search, '');
  });
}
test('map compatibility keeps invalid bounds for an explicit destination error', async () => {
  const url = await redirectFrom('locations', { south: 'broken', west: '36', north: '34', category: ['plumber','electrician'] });
  assert.equal(url.searchParams.get('south'), 'broken'); assert.equal(url.searchParams.get('east'), null);
  assert.equal(url.searchParams.get('category'), 'plumber');
});
