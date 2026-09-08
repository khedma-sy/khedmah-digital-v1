import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render the real discovery component. Only Next's routing/link adapters are replaced;
// account APIs throw if discovery accidentally starts depending on authentication.
const sourceUrl = new URL('../app/auth-navigation.tsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const requireFromSource = createRequire(sourceUrl);
const compiled = ts.transpileModule(source, {
  fileName: fileURLToPath(sourceUrl), reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
});
assert.deepEqual((compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error), []);
let pathname = '/';
const loaded = { exports: {} as { DiscoveryNavigation: () => ReactElement } };
const guardedRequire = (id: string) => {
  if (id === 'next/navigation') return { usePathname: () => pathname };
  if (id === 'next/link') return ({ children, ...props }: { children: ReactNode; href: string }) => createElement('a', props, children);
  if (id === '../lib/api-client') return { api: new Proxy({}, { get() { throw new Error('Discovery must not read account APIs.'); } }) };
  if (id === './components/platform-icon') return { PlatformIcon: () => null };
  return requireFromSource(id);
};
compileFunction(compiled.outputText, ['exports', 'require', 'module'], { filename: fileURLToPath(sourceUrl) })(loaded.exports, guardedRequire, loaded);
const expectedLinks = ['/search', '/categories', '/map', '/mobility', '/classifieds'];
const render = (path: string) => { pathname = path; return renderToStaticMarkup(createElement(loaded.exports.DiscoveryNavigation)); };

for (const path of ['/', ...expectedLinks, '/users/me', '/store']) {
  test(`discovery renders all five named links exactly once on ${path} without account state`, () => {
    const html = render(path);
    assert.match(html, /^<nav class="nav-discovery-group" aria-label="أقسام خدمة">/);
    assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), expectedLinks);
    for (const label of ['اكتشف', 'التصنيفات', 'بالقرب مني', 'تاكسي وتوصيل', 'الإعلانات']) assert.ok(html.includes(label));
    const active = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((match) => match[1]);
    assert.deepEqual(active, path === '/store' ? ['/classifieds'] : expectedLinks.includes(path) ? [path] : []);
    assert.doesNotMatch(html, /aria-hidden|tabindex="-1"|role="menu"/);
  });
}

test('layout retains one global header, the original brand, account and theme controls, and one discovery instance', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.equal((layout.match(/<header className="khedma-header">/g) ?? []).length, 1);
  assert.equal((layout.match(/<DiscoveryNavigation\s*\/>/g) ?? []).length, 1);
  assert.match(layout, /<BrandMark compact \/>/);
  assert.match(layout, /<AuthNavigation \/><ThemeToggle \/>/);
  assert.match(layout, /<html lang="ar" dir="rtl"/);
  assert.doesNotMatch(source.slice(source.indexOf('export function AuthNavigation')), /<DiscoveryNavigation|<DiscoveryLinks/);
  assert.match(source, /api\.auth\.logout\(\)/);
});

test('responsive shell wraps the shared navigation instead of hiding it or creating a second menu', () => {
  const shell = readFileSync(new URL('../app/shell-system.css', import.meta.url), 'utf8');
  const brand = readFileSync(new URL('../app/brand-system.css', import.meta.url), 'utf8');
  assert.doesNotMatch(brand, /\.khedma-header \.nav-discovery\s*\{[^}]*display\s*:\s*none/);
  assert.match(shell, /\.nav-discovery-group\{[^}]*flex-wrap:wrap/);
  assert.match(shell, /\.nav-discovery-group\{[^}]*grid-column:1\/-1/);
  assert.match(shell, /\.nav-discovery-group a\{[^}]*min-height:2\.75rem/);
  assert.match(shell, /\.nav-discovery-group a:focus-visible\{/);
});
