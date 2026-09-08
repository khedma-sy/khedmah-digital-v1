import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Next compiles JSX automatically. Explicitly use the same JSX runtime here so
// these DOM-contract tests do not depend on tsx's interpretation of jsx: preserve.
const sourceUrl = new URL('../app/components/ui-primitives.tsx', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: fileURLToPath(sourceUrl),
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true
  }
});
assert.deepEqual((compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error), []);

type SurfaceInput = {
  children: ReactNode;
  as?: 'section' | 'article' | 'aside' | 'div' | 'form';
  className?: string;
  id?: string;
  role?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-busy'?: boolean;
  onSubmit?: () => void;
};
type PrimitiveExports = {
  Surface: (props: SurfaceInput) => ReactElement<Record<string, unknown>>;
  StatusMessage: (props: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' }) => ReactElement;
};
const loaded = { exports: {} as PrimitiveExports };
compileFunction(compiled.outputText, ['exports', 'require', 'module'], { filename: fileURLToPath(sourceUrl) })(
  loaded.exports, createRequire(sourceUrl), loaded
);
const { Surface, StatusMessage } = loaded.exports;

for (const as of ['form', 'section', 'article', 'aside', 'div'] as const) {
  test(`Surface renders accessible identity and relationships on its ${as} element`, () => {
    const html = renderToStaticMarkup(createElement(Surface, {
      as, id: 'search-surface', className: 'existing-layout', role: as === 'form' ? 'search' : 'group',
      'aria-label': 'بحث عن مهنيين', 'aria-labelledby': 'search-heading',
      'aria-describedby': 'search-help', 'aria-busy': false,
      children: createElement('span', { id: 'search-heading' }, 'دليل المهنيين')
    }));
    assert.match(html, new RegExp(`^<${as}\\b`));
    assert.match(html, /class="ui-surface existing-layout"/);
    assert.match(html, /id="search-surface"/);
    assert.match(html, /aria-label="بحث عن مهنيين"/);
    assert.match(html, /aria-labelledby="search-heading"/);
    assert.match(html, /aria-describedby="search-help"/);
    assert.match(html, /aria-busy="false"/);
    assert.match(html, as === 'form' ? /role="search"/ : /role="group"/);
    assert.match(html, /<span id="search-heading">دليل المهنيين<\/span>/);
  });
}

test('Surface does not invent a role, name, relationship or busy state', () => {
  assert.equal(renderToStaticMarkup(createElement(Surface, { children: 'محتوى' })), '<section class="ui-surface">محتوى</section>');
});

test('Surface preserves both boolean busy states rather than dropping false', () => {
  for (const busy of [true, false]) {
    const html = renderToStaticMarkup(createElement(Surface, { as: 'form', 'aria-busy': busy, children: 'بحث' }));
    assert.ok(html.includes(`aria-busy="${busy}"`));
  }
});

test('Surface preserves the original submit handler only for a native form', () => {
  const onSubmit = () => undefined;
  assert.equal(Surface({ as: 'form', onSubmit, children: 'بحث' }).props.onSubmit, onSubmit);
  for (const as of ['section', 'article', 'aside', 'div'] as const) {
    assert.equal(Surface({ as, onSubmit, children: 'محتوى' }).props.onSubmit, undefined);
  }
});

test('StatusMessage renders alerts for danger and status for non-error tones', () => {
  for (const tone of ['info', 'success', 'warning', 'danger'] as const) {
    const html = renderToStaticMarkup(createElement(StatusMessage, { tone, children: 'رسالة' }));
    assert.ok(html.includes(`role="${tone === 'danger' ? 'alert' : 'status'}"`));
    assert.ok(html.includes(`class="ui-status ui-status-${tone}"`));
  }
});

test('professional search passes its actual Arabic form name to the tested primitive', async () => {
  const page = await readFile(new URL('../app/professional-profiles/search/page.tsx', import.meta.url), 'utf8');
  const name = page.match(/<Surface\b[^>]*as="form"[^>]*aria-label="([^"]+)"/);
  assert.ok(name, 'professional search must name its Surface form');
  const html = renderToStaticMarkup(createElement(Surface, { as: 'form', 'aria-label': name[1], children: 'بحث' }));
  assert.ok(html.includes(`aria-label="${name[1]}"`));
});
