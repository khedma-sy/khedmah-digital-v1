import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../app/taxi-driver-signup/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022
} }).outputText;

async function renderAfterProfiles(status: number) {
  const states: unknown[] = [];
  let cursor = 0;
  let effect: (() => void) | undefined;
  let writes = 0;
  const react = { ...require('react'),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(callback: () => void) { effect ??= callback; },
    useMemo(callback: () => unknown) { return callback(); },
    useRef(value: unknown) { return { current: value }; }
  };
  const wrap = (tag: string) => ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => {
    const { variant: _variant, tone, as: _as, ...rest } = props;
    return createElement(tag, { ...rest, ...(tone === 'danger' ? { role: 'alert' } : {}) }, children);
  };
  const loaded = { exports: {} as { default: () => ReactNode } };
  runInNewContext(compiled, { exports: loaded.exports, module: loaded, require(id: string) {
    if (id === 'react') return react;
    if (id === '../../lib/api-client') return { api: { businesses: {
      async listMine() { if (status !== 200) throw Object.assign(new Error('read failed'), { statusCode: status }); return { businesses: [] }; },
      async create() { writes++; throw new Error('unexpected write'); }
    } } };
    if (id === '../../lib/use-syrian-cities') return { useSyrianCities: () => ({ cities: [{ code: 'damascus', nameAr: 'دمشق' }], isLoading: false, error: '', retry: () => {} }) };
    if (id === '../../lib/taxi-operational-review-client') return { taxiOperationalReviewApi: {} };
    if (id === '../components/ui-primitives') return { PageShell: wrap('main'), Surface: wrap('section'), StatusMessage: wrap('div'), ActionLink: wrap('a'), ActionButton: wrap('button'),
      PageHeader: ({ title }: { title: string }) => createElement('h1', {}, title) };
    if (id.endsWith('.module.css')) return { default: {} };
    return require(id);
  } });
  renderToStaticMarkup(createElement(loaded.exports.default));
  assert.ok(effect);
  effect();
  await new Promise<void>((resolve) => setImmediate(resolve));
  cursor = 0;
  return { html: renderToStaticMarkup(createElement(loaded.exports.default)), writes };
}

test('401 shows an informational login entry and six steps without writable driver forms', async () => {
  const { html, writes } = await renderAfterProfiles(401);
  assert.match(html, /href="\/auth\/login\?next=%2Ftaxi-driver-signup"/);
  assert.match(html, /ابدأ بتسجيل الدخول/);
  assert.equal((html.match(/<li /g) ?? []).length, 6);
  assert.doesNotMatch(html, /<form|<input|role="alert"/);
  assert.equal(writes, 0);
});

test('service failure remains an error with retry, not a guest or a blank editable profile', async () => {
  const { html, writes } = await renderAfterProfiles(503);
  assert.match(html, /role="alert"/);
  assert.match(html, /إعادة المحاولة/);
  assert.doesNotMatch(html, /<form|<input|ابدأ بتسجيل الدخول/);
  assert.equal(writes, 0);
});

test('a successful account lookup with no Taxi profile exposes the existing creation form', async () => {
  const { html, writes } = await renderAfterProfiles(200);
  assert.match(html, /<form/);
  assert.match(html, /إنشاء ملف التكسي/);
  assert.doesNotMatch(html, /ابدأ بتسجيل الدخول|role="alert"/);
  assert.equal(writes, 0);
});
