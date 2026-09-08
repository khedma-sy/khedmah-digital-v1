import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

// Controlled hooks execute the shipped page; this is not authenticated browser evidence.
function fixture({ completed = false, brokenStorage = false } = {}) {
  const calls = [], navigations = [], slots = [], effects = new Map();
  let cursor = 0, dirty, tree, mounted = true, writesAfterUnmount = 0;
  const hooks = {
    useState(initial) {
      const i = cursor++; const slot = slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, (value) => {
        if (!mounted) { writesAfterUnmount++; return; }
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; dirty = true; }
      }];
    },
    useEffect(setup, deps) {
      const i = cursor++; const slot = slots[i] ??= {};
      if (!slot.deps || !deps.every((v, j) => Object.is(v, slot.deps[j]))) { slot.deps = deps; slot.setup = setup; effects.set(i, setup); }
    }
  };
  const router = { push: (path) => navigations.push(path), replace: (path) => navigations.push(path) };
  const sessionStorage = {
    getItem() { if (brokenStorage) throw new Error('storage denied'); return completed ? 'true' : null; },
    setItem() { if (brokenStorage) throw new Error('storage denied'); completed = true; }
  };
  const api = { auth: { session() { let resolve, reject; const promise = new Promise((y, n) => { resolve = y; reject = n; }); calls.push({ resolve, reject }); return promise; } } };
  const jsx = (type, props) => ({ type, props }); const exports = {};
  const adapters = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/navigation': { useRouter: () => router },
    '../../lib/api-client': { api }, '../components/brand-mark': { BrandMark: 'BrandMark' },
    '../components/platform-icon': { PlatformIcon: 'PlatformIcon' },
    '../components/ui-primitives': Object.fromEntries(['ActionButton','SkeletonGrid','StatusMessage','Surface'].map(n => [n, n])),
    './welcome.module.css': new Proxy({}, { get: (_, key) => key })
  };
  const source = readFileSync(new URL('../apps/frontend/app/welcome/page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  new Script(compiled.outputText).runInContext(createContext({ exports, Error, sessionStorage, require(id) { assert.ok(id in adapters, id); return adapters[id]; } }));
  function render() {
    let n = 0;
    do { cursor = 0; dirty = false; tree = exports.default(); const pending = [...effects]; effects.clear();
      for (const [i] of pending) slots[i].cleanup?.(); for (const [i, setup] of pending) slots[i].cleanup = setup();
      assert.ok(++n < 20);
    } while (dirty);
  }
  function* walk(n) { if (Array.isArray(n)) { for (const item of n) yield* walk(item); } else if (n && typeof n === 'object') { yield n; yield* walk(n.props?.children); } }
  const text = (n) => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : n == null || typeof n === 'boolean' ? '' : String(n);
  render();
  return { calls, navigations, get text() { return text(tree); }, get writesAfterUnmount() { return writesAfterUnmount; },
    click(label) { const b = [...walk(tree)].find(n => n.type === 'ActionButton' && text(n) === label); assert.ok(b, label); b.props.onClick(); render(); },
    unmount() { for (const s of slots) s.cleanup?.(); mounted = false; },
    replay() { for (const s of slots) s.cleanup?.(); for (const s of slots) if (s.setup) s.cleanup = s.setup(); render(); },
    async flush() { await new Promise(setImmediate); render(); }
  };
}
const user = { profile: { displayName: 'اختبار' } };
test('network failure is recoverable and is not reported as expired session', async () => {
  const f = fixture(); f.calls[0].reject(new TypeError('Failed to fetch')); await f.flush();
  assert.doesNotMatch(f.text, /انتهت الجلسة/); f.click('إعادة المحاولة'); assert.equal(f.calls.length, 2);
  f.calls[1].resolve({ user }); await f.flush(); assert.match(f.text, /اختبار/);
});
test('401 asks for login and never reports a successful onboarding', async () => {
  const f = fixture(); f.calls[0].reject(Object.assign(new Error('expired'), { statusCode: 401 })); await f.flush();
  assert.match(f.text, /انتهت الجلسة/); f.click('تسجيل الدخول'); assert.deepEqual(f.navigations, ['/auth/login']);
});
test('server and forbidden failures do not pretend the user logged out', async () => {
  for (const statusCode of [403, 500, 503]) { const f = fixture(); f.calls[0].reject(Object.assign(new Error('error'), { statusCode })); await f.flush(); assert.doesNotMatch(f.text, /انتهت الجلسة/); assert.match(f.text, /إعادة المحاولة/); }
});
test('effect replay and unmount ignore prior session completions', async () => {
  const f = fixture(); f.replay(); f.calls[1].resolve({ user }); await f.flush(); f.calls[0].reject(new Error('old')); await f.flush(); assert.match(f.text, /اختبار/);
  const g = fixture(); g.unmount(); g.calls[0].resolve({ user }); await new Promise(setImmediate); assert.equal(g.writesAfterUnmount, 0);
});
test('completed onboarding skips the request; denied storage still allows onboarding', async () => {
  const done = fixture({ completed: true }); assert.equal(done.calls.length, 0); assert.deepEqual(done.navigations, ['/']);
  const blocked = fixture({ brokenStorage: true }); blocked.calls[0].resolve({ user }); await blocked.flush(); blocked.click('ابدأ الاكتشاف '); assert.deepEqual(blocked.navigations, ['/']);
});
