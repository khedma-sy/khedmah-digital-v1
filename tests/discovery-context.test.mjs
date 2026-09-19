import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../apps/frontend/lib/discovery-context.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { fileName: 'discovery-context.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.deepEqual((compiled.diagnostics ?? []).filter(({ category }) => category === ts.DiagnosticCategory.Error), []);
const exported = {};
compileFunction(compiled.outputText, ['exports'])(exported);
const { discoveryPage, readDiscoveryContext, discoveryContextKey, categoryDirectoryHref } = exported;

test('page accepts positive safe decimal integers and rejects malformed URL input', () => {
  for (const value of [null, '', '0', '-1', '1.5', '1e3', '0x20', '2words', '01', 'Infinity', '9007199254740992']) {
    assert.equal(discoveryPage(value), 1, String(value));
  }
  assert.equal(discoveryPage('2'), 2);
  assert.equal(discoveryPage('123'), 123);
});

test('legacy category is read only when canonical category is absent', () => {
  assert.equal(readDiscoveryContext(new URLSearchParams('category=old')).categoryCode, 'old');
  assert.equal(readDiscoveryContext(new URLSearchParams('category=old&categoryCode=new')).categoryCode, 'new');
  assert.equal(readDiscoveryContext(new URLSearchParams('category=old&categoryCode=')).categoryCode, '');
});

test('URL context has stable normalized values without inventing a default city', () => {
  assert.deepEqual(readDiscoveryContext(new URLSearchParams()), { q: '', cityCode: '', categoryCode: '', page: 1 });
  assert.deepEqual(readDiscoveryContext(new URLSearchParams('q=%20repair%20&cityCode=%20homs%20&category=plumbing&page=2')),
    { q: 'repair', cityCode: 'homs', categoryCode: 'plumbing', page: 2 });
});

test('writer preserves query, city and unrelated context without mutating the input', () => {
  const params = new URLSearchParams('q=repair&cityCode=aleppo&category=old&page=9&source=discovery');
  const before = params.toString();
  const href = categoryDirectoryHref(params, 'plumbing', 2);
  const next = new URL(href, 'https://example.test');
  assert.equal(next.pathname, '/categories'); assert.equal(params.toString(), before);
  assert.equal(next.searchParams.has('category'), false);
  assert.deepEqual(readDiscoveryContext(next.searchParams), { q: 'repair', cityCode: 'aleppo', categoryCode: 'plumbing', page: 2 });
  assert.equal(next.searchParams.get('source'), 'discovery');
});

test('clearing the category preserves the city and never resurrects its old alias', () => {
  const url = new URL(categoryDirectoryHref(new URLSearchParams('category=old&categoryCode=current&cityCode=homs'), '', 1), 'https://example.test');
  assert.equal(url.searchParams.has('category'), false); assert.equal(url.searchParams.has('categoryCode'), false);
  assert.equal(url.searchParams.get('cityCode'), 'homs'); assert.equal(url.searchParams.has('page'), false);
});

test('writer encodes special text as query data and keeps a fixed local route', () => {
  const params = new URLSearchParams({ q: 'سباكة & كهرباء # اختبار', cityCode: 'homs' });
  const url = new URL(categoryDirectoryHref(params, 'plumbing&cityCode=other', 1), 'https://example.test');
  assert.equal(url.origin, 'https://example.test'); assert.equal(url.pathname, '/categories'); assert.equal(url.hash, '');
  assert.equal(url.searchParams.get('q'), 'سباكة & كهرباء # اختبار');
  assert.equal(url.searchParams.get('cityCode'), 'homs');
  assert.equal(url.searchParams.get('categoryCode'), 'plumbing&cityCode=other');
});

test('writer is idempotent and context key ignores parameter order or legacy spelling', () => {
  const params = new URLSearchParams('category=plumbing&cityCode=homs&q=repair&page=2');
  const href = categoryDirectoryHref(params, 'plumbing', 2);
  const canonical = new URL(href, 'https://example.test').searchParams;
  assert.equal(categoryDirectoryHref(canonical, 'plumbing', 2), href);
  assert.equal(discoveryContextKey(readDiscoveryContext(params)), discoveryContextKey(readDiscoveryContext(canonical)));
  assert.notEqual(discoveryContextKey(readDiscoveryContext(params)), discoveryContextKey(readDiscoveryContext(new URLSearchParams('category=plumbing&cityCode=aleppo&q=repair&page=2'))));
});

test('directory URL reader is behind a Suspense boundary without changing the header', () => {
  const page = readFileSync(new URL('../apps/frontend/app/categories/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<Suspense\b[\s\S]*<CategoryDirectory\s*\/>[\s\S]*<\/Suspense>/);
  assert.doesNotMatch(page, /<header|khedma-header/);
});
