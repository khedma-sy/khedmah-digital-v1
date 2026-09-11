import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const searchSource = read('apps/frontend/app/professional-profiles/search/page.tsx');
const discoverySource = read('apps/frontend/lib/discovery-context.ts');

const normalize = (value) => JSON.parse(JSON.stringify(value));
const cities = [{ code: 'damascus', nameAr: 'دمشق', countryCode: 'SY' }, { code: 'aleppo', nameAr: 'حلب', countryCode: 'SY' }];
const categories = [{ code: 'plumbing', nameAr: 'السباكة' }, { code: 'electrical', nameAr: 'الكهرباء' }];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function load(source, name, adapters, globals = {}) {
  const compiled = ts.transpileModule(source, { fileName: name, reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  } });
  assert.equal(compiled.diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
  const exports = {};
  new Script(compiled.outputText, { filename: name }).runInContext(createContext({ exports, URLSearchParams, Error, ...globals,
    require(id) { if (id in adapters) return adapters[id]; throw new Error(`Unexpected dependency: ${id}`); }
  }));
  return exports;
}
const discovery = load(discoverySource, 'discovery-context.ts', {});



// Execute the actual page with controlled metadata, promises and hook lifecycle.
// These adapters are NOT React DOM, browser-history or CSS certification.
function fixture(query = '', options = {}) {
  const slots = [], effects = new Map(), calls = [], navigations = [];
  let cursor = 0, dirty = true, mounted = true, writesAfterUnmount = 0, output;
  let cityMetadata = { cities, isLoading: false, error: '', retry() {}, ...options.cities };
  let categoryMetadata = { categories, isLoading: false, error: '', retry() {}, ...options.categories };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++; const slot = slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, (next) => { if (!mounted) { writesAfterUnmount++; return; }
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(slot.value, value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(setup, dependencies) {
      const i = cursor++, slot = slots[i] ??= {};
      if (!same(slot.dependencies, dependencies)) { slot.dependencies = dependencies; slot.setup = setup; effects.set(i, setup); }
    }
  };
  const location = new URL(`/professional-profiles/search${query}`, 'https://fixture.example.test');
  const entries = [location.href]; let index = 0;
  const navigate = (href, mode = 'push') => {
    location.href = new URL(href, location).href;
    if (mode === 'push') { entries.splice(index + 1); entries.push(location.href); index++; }
    else entries[index] = location.href;
    navigations.push({ mode, href }); dirty = true;
  };
  const router = { push: (href) => navigate(href), replace: (href) => navigate(href, 'replace') };
  let cachedQuery, cachedParams;
  function useSearchParams() {
    if (cachedQuery !== location.search) { cachedQuery = location.search; cachedParams = new URLSearchParams(cachedQuery); }
    return cachedParams;
  }
  const makeCall = (kind) => (input) => { const call = { ...deferred(), kind, input: normalize(input) }; calls.push(call); return call.promise; };
  const api = { search: { query: makeCall('all') }, services: { search: makeCall('service') }, businesses: { search: makeCall('business') }, professionals: { search: makeCall('professional') } };
  const jsx = (type, props) => ({ type, props });
  const primitives = Object.fromEntries(['PageShell','PageHeader','Surface','ActionButton','ActionLink','EmptyState','SkeletonGrid','StatusMessage'].map((name) => [name,name]));
  const module = load(`${searchSource}\nexport { ProfessionalSearchContent };`, 'page.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router, useSearchParams },
    '../../../lib/api-client': { api }, '../../../lib/discovery-context': discovery,
    '../../../lib/use-categories': { useCategories: () => categoryMetadata },
    '../../../lib/use-syrian-cities': { useSyrianCities: () => cityMetadata,
      canonicalCityCode: (code, list) => list.some((city) => city.countryCode === 'SY' && city.code === code) ? code : '',
      cityLabel: (code, list) => list.find((city) => city.code === code)?.nameAr ?? '' },
    '../../components/platform-icon': { PlatformIcon: 'PlatformIcon' },
    '../../components/category-select-options': { CategorySelectOptions: 'CategorySelectOptions' },
    '../../components/ui-primitives': primitives, '../../discovery.module.css': new Proxy({}, { get: (_, key) => key })
  }, { window: { scrollTo() {} } });
  function render(runEffects = true) {
    let rounds = 0;
    do {
      cursor = 0; dirty = false; output = module.ProfessionalSearchContent();
      if (!runEffects) return;
      const pending = [...effects]; effects.clear();
      for (const [i] of pending) slots[i].cleanup?.();
      for (const [i, setup] of pending) slots[i].cleanup = setup();
      assert.ok(++rounds < 40, 'no effect/render loop');
    } while (dirty);
  }
  function* walk(node) {
    if (Array.isArray(node)) { for (const value of node) yield* walk(value); }
    else if (node && typeof node === 'object' && 'type' in node) { yield node; yield* walk(node.props?.children); yield* walk(node.props?.actions); }
  }
  const all = () => [...walk(output)];
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
  function button(label) {
    const node = all().find((item) => ['button','ActionButton'].includes(item.type) && text(item) === label);
    assert.ok(node, `button exists: ${label}`); assert.ok(!node.props.disabled, `button enabled: ${label}`); return node;
  }
  render();
  return {
    calls, location, navigations, render,
    get busy() { return all().some((n) => n.type === 'SkeletonGrid'); },
    get alerts() { return all().filter((n) => n.type === 'StatusMessage').map(text).join('|'); },
    get titles() { return all().filter((n) => n.type === 'h2').map(text); },
    get summary() { return all().filter((n) => n.props?.['aria-live'] === 'polite').map(text).join('|'); },
    get values() { return Object.fromEntries(all().filter((n) => ['input','select'].includes(n.type)).map((n) => [n.props.id, n.props.value])); },
    get writesAfterUnmount() { return writesAfterUnmount; },
    setMetadata(kind, patch) { if (kind === 'cities') cityMetadata = { ...cityMetadata, ...patch }; else categoryMetadata = { ...categoryMetadata, ...patch }; render(); },
    edit(id, value) { const node = all().find((n) => n.props?.id === id); assert.ok(node); node.props.onChange({ target: { value } }); render(); },
    click(label) { button(label).props.onClick?.(); render(); },
    submit() { all().find((n) => n.type === 'form' || n.props?.as === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    navigate(query) { navigate(`/professional-profiles/search${query}`); render(); },
    back() { if (index > 0) { location.href = entries[--index]; render(); } },
    forward() { if (index + 1 < entries.length) { location.href = entries[++index]; render(); } },
    unmount() { for (const slot of slots) slot.cleanup?.(); mounted = false; },
    replayEffects() { for (const slot of slots) if (slot.setup) slot.cleanup?.(); for (const slot of slots) if (slot.setup) slot.cleanup = slot.setup(); render(); },
    async flush() { await new Promise(setImmediate); render(); await new Promise(setImmediate); render(); }
  };
}
function response(kind, title, count = 1, total = count) {
  const items = Array.from({ length: count }, (_, i) => ({ id: `${title}-${i}`, name: title, titleAr: title, headlineAr: title, skills: [], categoryCode: 'plumbing', cityCode: 'damascus', ownerType: 'business', ownerId: 'fixture' }));
  return { businesses: kind === 'business' || kind === 'all' ? items : [], services: kind === 'service' ? items : [], professionals: kind === 'professional' ? items : [], page: 1, total };
}
async function finish(f, title = 'نتيجة', call = f.calls.at(-1), count = 1, total = count) { call.resolve(response(call.kind, title, count, total)); await f.flush(); }

test('one submission issues one request after URL navigation', () => {
  const f = fixture(); f.edit('professional-q', 'repair'); f.submit(); assert.equal(f.calls.length, 1);
});
test('an old response cannot overwrite a newer navigation', async () => {
  const f = fixture('?q=old'); const old = f.calls[0]; f.navigate('?q=new');
  await finish(f, 'جديد'); await finish(f, 'قديم', old); assert.deepEqual(f.titles, ['جديد']);
});
test('clear invalidates in-flight results', async () => {
  const f = fixture('?q=old'); const old = f.calls[0]; f.click('مسح'); await finish(f, 'قديم', old);
  assert.deepEqual(f.titles, []); assert.equal(f.busy, false);
});
test('metadata error does not discard selected city or broaden search', () => {
  const f = fixture('?q=repair&cityCode=aleppo', { cities: { cities: [], error: 'offline' } });
  assert.equal(f.calls.length, 0); assert.equal(f.location.searchParams.get('cityCode'), 'aleppo'); assert.ok(f.alerts);
});
test('pagination belongs to applied filters, not draft edits', async () => {
  const f = fixture('?cityCode=damascus'); await finish(f, 'دمشق', f.calls[0], 20);
  f.edit('professional-city', 'aleppo'); f.click('التالي'); assert.equal(f.calls.at(-1).input.cityCode, 'damascus');
});

test('Back and Forward restore the applied filters and page', async () => {
  const f = fixture('?cityCode=damascus&availability=busy&page=2'); await finish(f);
  f.edit('professional-city', 'aleppo'); f.submit(); await finish(f); f.back();
  assert.equal(f.calls.at(-1).input.cityCode, 'damascus'); assert.equal(f.calls.at(-1).input.page, 2);
  f.forward(); assert.equal(f.calls.at(-1).input.cityCode, 'aleppo');
});
test('empty submit searches once; returning to landing hides results', async () => {
  const f = fixture(); assert.equal(f.calls.length, 0); f.submit(); assert.equal(f.calls.length, 1);
  await finish(f); f.back(); assert.deepEqual(f.titles, []); assert.equal(f.busy, false);
});
test('retry repeats the same applied query once', async () => {
  const f = fixture('?q=repair'); f.calls[0].reject(new Error('offline')); await f.flush();
  assert.ok(f.alerts); f.click('إعادة المحاولة'); assert.equal(f.calls.length, 2); await finish(f); assert.equal(f.alerts, '');
});
test('old rejection cannot stop a newer spinner or publish an error', async () => {
  const f = fixture('?q=old'); const old = f.calls[0]; f.navigate('?q=new'); old.reject(new Error('old')); await f.flush();
  assert.equal(f.busy, true); assert.equal(f.alerts, ''); await finish(f, 'حديث'); assert.deepEqual(f.titles, ['حديث']);
});
test('metadata waits and recovers without losing selected city', async () => {
  const f = fixture('?cityCode=aleppo', { cities: { cities: [], isLoading: true } });
  assert.equal(f.calls.length, 0); assert.equal(f.values['professional-city'], 'aleppo'); assert.equal(f.busy, true);
  f.setMetadata('cities', { cities, isLoading: false }); assert.equal(f.calls[0].input.cityCode, 'aleppo'); await finish(f);
});
test('unknown city and availability remain explicit errors', () => {
  for (const query of ['?cityCode=unknown', '?availability=unknown']) {
    const f = fixture(query); assert.equal(f.calls.length, 0); assert.ok(f.alerts); assert.equal(f.busy, false); assert.equal(f.navigations.length, 0);
  }
});
test('invalid pagination never reaches the API as fractional or infinite', () => {
  for (const value of ['1.5', 'Infinity', '-3', '99999999999999999999']) assert.equal(fixture('?page='+value).calls[0].input.page, 1);
});
test('empty later page still provides Previous', async () => {
  const f = fixture('?q=repair&page=2'); await finish(f, 'فارغ', f.calls[0], 0); f.click('السابق'); assert.equal(f.calls.at(-1).input.page, 1);
});
test('unmount and effect replay invalidate all prior completions', async () => {
  const f = fixture('?q=repair'); const old = f.calls[0]; f.replayEffects(); await finish(f, 'حديث'); await finish(f, 'قديم', old);
  assert.deepEqual(f.titles, ['حديث']); f.navigate('?q=next'); const pending = f.calls.at(-1); f.unmount();
  pending.resolve(response('professional', 'unmounted')); await new Promise(setImmediate); assert.equal(f.writesAfterUnmount, 0);
});
