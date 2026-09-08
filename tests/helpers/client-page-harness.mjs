import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
export const readSource = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
export function loadSource(source, adapters, globals = {}) {
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const exports = {};
  new Script(compiled.outputText).runInContext(createContext({ exports, Error, URLSearchParams, ...globals, require(id) { assert.ok(id in adapters, id); return adapters[id]; } }));
  return exports;
}
// Executes the actual TSX with controlled effects and network. It does not certify DOM/CSS or a live session.
export function clientPage(source, adapters, globals = {}) {
  const slots = [], pending = new Map(); let cursor = 0, dirty, tree, mounted = true, writesAfterUnmount = 0;
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const hooks = {
    useState(initial) { const i = cursor++; const s = slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [s.value, v => { if (!mounted) { writesAfterUnmount++; return; } const next = typeof v === 'function' ? v(s.value) : v; if (!Object.is(next,s.value)) { s.value = next; dirty = true; } }]; },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(setup,deps) { const i = cursor++; const s = slots[i] ??= {}; if (!same(s.deps,deps)) { s.deps = deps; s.setup = setup; pending.set(i,setup); } },
    useCallback(fn,deps) { const i = cursor++; const s = slots[i] ??= {}; if (!same(s.deps,deps)) { s.deps = deps; s.value = fn; } return s.value; },
    useMemo(fn,deps) { const i = cursor++; const s = slots[i] ??= {}; if (!same(s.deps,deps)) { s.deps = deps; s.value = fn(); } return s.value; }
  };
  const jsx = (type,props) => ({ type,props });
  const page = loadSource(source, { ...adapters, react: hooks, 'react/jsx-runtime': { jsx,jsxs:jsx,Fragment:'Fragment' } }, globals);
  function render(runEffects = true) { let n = 0; do { cursor = 0; dirty = false; tree = page.default(); if (!runEffects) return;
    const effects = [...pending]; pending.clear(); for (const [i] of effects) slots[i].cleanup?.(); for (const [i,setup] of effects) slots[i].cleanup = setup(); assert.ok(++n < 30,'no render loop');
  } while (dirty); }
  function* walk(node) { if (Array.isArray(node)) { for (const n of node) yield* walk(n); } else if (node && typeof node === 'object' && 'type' in node) { yield node; yield* walk(node.props?.children); yield* walk(node.props?.actions); } }
  const all = () => [...walk(tree)];
  const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : n == null || typeof n === 'boolean' ? '' : String(n);
  render();
  return { render, all, find: fn => all().find(fn), get text() { return text(tree); }, get writesAfterUnmount() { return writesAfterUnmount; },
    click(label) { const b = all().find(n => ['button','ActionButton'].includes(n.type) && text(n) === label); assert.ok(b,label); assert.ok(!b.props.disabled,'enabled: '+label); b.props.onClick?.(); render(); },
    edit(name,value) { const input = all().find(n => n.props?.name === name); assert.ok(input,name); input.props.onChange({ target: { value } }); render(); },
    submit(form) { const f = all().find(n => n.type === 'form' || n.props?.as === 'form'); assert.ok(f,'form exists'); const result = f.props.onSubmit({ preventDefault() {}, currentTarget: form }); render(); return result; },
    unmount() { for (const s of slots) s.cleanup?.(); mounted = false; },
    replay() { for (const s of slots) s.cleanup?.(); for (const s of slots) if (s.setup) s.cleanup = s.setup(); render(); },
    async flush() { await new Promise(setImmediate); if (mounted) render(); }
  };
}
export const primitives = Object.fromEntries(['ActionButton','ActionLink','PageHeader','PageShell','SkeletonGrid','StatusMessage','Surface','EmptyState'].map(n=>[n,n]));
export const css = new Proxy({}, { get: (_,key) => key });
