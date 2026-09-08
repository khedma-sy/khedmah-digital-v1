import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const revision = '2026-09-08T01:00:00.123456Z';
const product = { id: 'p', revision, titleAr: 'منتج', descriptionAr: 'الوصف الكامل', price: 100, currency: 'SYP', categoryCode: 'general', availability: 'in_stock', imageUrls: ['/first', '/second'] };
function load(source, adapters, globals = {}) {
  const exports = {}; const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  new Script(compiled.outputText).runInContext(createContext({ exports, Error, URLSearchParams, ...globals, require(id) { assert.ok(id in adapters, id); return adapters[id]; } })); return exports;
}
function fixture() {
  const slots = [], pending = new Map(), calls = []; let cursor = 0, dirty, tree, failure, queueFailure, queueReads = 0;
  const hooks = {
    useState(initial) { const i = cursor++; const s = slots[i] ??= { value: initial }; return [s.value, v => { const next = typeof v === 'function' ? v(s.value) : v; if (!Object.is(next, s.value)) { s.value = next; dirty = true; } }]; },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(setup, deps) { const i = cursor++; const s = slots[i] ??= {}; if (!s.deps || !deps.every((v,j) => Object.is(v,s.deps[j]))) { s.deps = deps; pending.set(i,setup); } }
  };
  const api = { moderation: { listPending: async () => ({ businesses: [], professionals: [] }), listReports: async () => ({ reports: [] }) },
    adminProducts: { pending: async () => { queueReads++; if (queueFailure) throw queueFailure; return { products: [{ ...product }] }; }, review: async (...args) => { calls.push(args); if (failure) throw failure; return { product }; } } };
  const jsx = (type, props) => ({ type, props });
  const page = load(read('apps/frontend/app/admin/moderation/page.tsx'), { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../../../lib/api-client': { api } },
    { window: { requestAnimationFrame: fn => fn() }, document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {} });
  function render() { let n = 0; do { cursor = 0; dirty = false; tree = page.default(); const effects = [...pending]; pending.clear(); for (const [i, setup] of effects) { slots[i].cleanup?.(); slots[i].cleanup = setup(); } assert.ok(++n < 20); } while (dirty); }
  function* walk(n) { if (Array.isArray(n)) { for (const v of n) yield* walk(v); } else if (n && typeof n === 'object') { yield n; yield* walk(n.props?.children); } }
  const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : n == null || typeof n === 'boolean' ? '' : String(n);
  render();
  return { calls, get queueReads() { return queueReads; }, get text() { return text(tree); }, get images() { return [...walk(tree)].filter(n => n.type === 'a').map(n => n.props.href); },
    get dialog() { return [...walk(tree)].some(n => n.props?.role === 'dialog'); },
    set failure(value) { failure = value; }, set queueFailure(value) { queueFailure = value; },
    click(label) { const b = [...walk(tree)].find(n => n.type === 'button' && text(n) === label); assert.ok(b, label); assert.ok(!b.props.disabled); b.props.onClick(); render(); },
    async flush() { await new Promise(setImmediate); render(); }
  };
}
test('review sends the displayed revision and presents every image and description', async () => {
  const f = fixture(); await f.flush(); assert.deepEqual(f.images, ['/first', '/second']); assert.match(f.text, /الوصف الكامل/);
  f.click('نشر'); f.click('تأكيد القرار'); await f.flush(); assert.deepEqual(f.calls[0], ['p','approved',revision,undefined]); assert.equal(f.dialog, false);
});
test('409 refreshes the queue and requires a new explicit decision', async () => {
  const f = fixture(); await f.flush(); f.failure = Object.assign(new Error('conflict'), { statusCode: 409 });
  f.click('نشر'); f.click('تأكيد القرار'); await f.flush(); assert.equal(f.calls.length, 1); assert.equal(f.queueReads, 2); assert.equal(f.dialog, false); assert.match(f.text, /تغير المنتج أو صوره/); assert.doesNotMatch(f.text, /تم نشر المنتج/);
});
test('failed queue refresh is recoverable without replaying moderation', async () => {
  const f = fixture(); await f.flush(); f.failure = Object.assign(new Error('conflict'), { statusCode: 409 }); f.queueFailure = new Error('offline');
  f.click('نشر'); f.click('تأكيد القرار'); await f.flush(); assert.match(f.text, /إعادة المحاولة/); f.queueFailure = null; f.click('إعادة المحاولة'); await f.flush(); assert.equal(f.calls.length, 1); assert.equal(f.queueReads, 3);
});
test('the real API client serializes revision and preserves 409 errors', async () => {
  const requests = [];
  const { api } = load(read('apps/frontend/lib/api-client.ts'), {}, { fetch: async (url, init) => { requests.push({ url, init }); return { ok: false, status: 409, json: async () => ({ message: 'changed' }) }; } });
  await assert.rejects(() => api.adminProducts.review('a/b', 'approved', revision), cause => cause.statusCode === 409);
  assert.equal(requests[0].url, '/api/v1/admin/products/a%2Fb/moderation'); assert.deepEqual(JSON.parse(requests[0].init.body), { status: 'approved', expectedRevision: revision });
});
