import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const searchSource = read('apps/frontend/app/search/page.tsx');
const discoverySource = read('apps/frontend/lib/discovery-context.ts');
const helperSource = read('apps/frontend/lib/search-context.ts');
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
const mapHelpers = load(read('apps/frontend/lib/map-context.ts'), 'map-context.ts', { './discovery-context': discovery });
const helpers = load(helperSource, 'search-context.ts', { './discovery-context': discovery });

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
  const location = new URL(`/search${query}`, 'https://fixture.example.test');
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
  const module = load(`${searchSource}\nexport { SearchContent };`, 'page.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router, useSearchParams },
    '../../lib/api-client': { api }, '../../lib/search-context': helpers, '../../lib/map-context': mapHelpers,
    '../../lib/use-categories': { useCategories: () => categoryMetadata },
    '../../lib/use-syrian-cities': { useSyrianCities: () => cityMetadata,
      canonicalCityCode: (code, list) => list.some((city) => city.countryCode === 'SY' && city.code === code) ? code : '',
      cityLabel: (code, list) => list.find((city) => city.code === code)?.nameAr ?? '' },
    '../components/platform-icon': { PlatformIcon: 'PlatformIcon' },
    '../components/category-select-options': { CategorySelectOptions: 'CategorySelectOptions' },
    '../components/ui-primitives': primitives, '../discovery.module.css': new Proxy({}, { get: (_, key) => key })
  }, { window: { scrollTo() {} } });
  function render(runEffects = true) {
    let rounds = 0;
    do {
      cursor = 0; dirty = false; output = module.SearchContent();
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
    get titles() { return all().filter((n) => n.type === 'h3').map(text); },
    get summary() { return all().filter((n) => n.props?.['aria-live'] === 'polite').map(text).join('|'); },
    get values() { return Object.fromEntries(all().filter((n) => ['input','select'].includes(n.type)).map((n) => [n.props.id, n.props.value])); },
    get writesAfterUnmount() { return writesAfterUnmount; },
    setMetadata(kind, patch) { if (kind === 'cities') cityMetadata = { ...cityMetadata, ...patch }; else categoryMetadata = { ...categoryMetadata, ...patch }; render(); },
    edit(id, value) { const node = all().find((n) => n.props?.id === id); assert.ok(node); node.props.onChange({ target: { value } }); render(); },
    click(label) { button(label).props.onClick?.(); render(); },
    submit() { all().find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    navigate(query) { navigate(`/search${query}`); render(); },
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

test('landing does not fetch or show old results until search is requested', () => { const f = fixture(); assert.equal(f.calls.length, 0); assert.equal(f.busy, false); });
test('selected city waits for metadata and is never replaced by an unfiltered request', async () => {
  const f = fixture('?q=repair&cityCode=aleppo', { cities: { cities: [], isLoading: true } });
  assert.equal(f.calls.length, 0); assert.equal(f.values.city, 'aleppo'); assert.equal(f.busy, true);
  f.setMetadata('cities', { cities, isLoading: false }); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.cityCode, 'aleppo');
  await finish(f); assert.equal(f.busy, false);
});
test('metadata failure preserves URL and supports recovery with the same city', async () => {
  const f = fixture('?cityCode=aleppo', { cities: { cities: [], error: 'network' } });
  assert.equal(f.calls.length, 0); assert.match(f.location.search, /cityCode=aleppo/); assert.ok(f.alerts);
  f.setMetadata('cities', { cities, error: '' }); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.cityCode, 'aleppo'); await finish(f);
});
test('unknown city is an explicit error, not a broad query or redirect to /search', () => {
  const f = fixture('?cityCode=invented&type=service'); assert.equal(f.calls.length, 0); assert.match(f.alerts, /المدينة المحددة غير متاحة/); assert.match(f.location.search, /invented/); assert.equal(f.busy, false);
});
test('category metadata loading, failure and recovery preserve requested filters', () => {
  const f = fixture('?categoryCode=plumbing&cityCode=damascus', { categories: { categories: [], isLoading: true } }); assert.equal(f.calls.length, 0);
  f.setMetadata('categories', { isLoading: false, error: 'offline' }); assert.equal(f.calls.length, 0); assert.ok(f.alerts);
  f.setMetadata('categories', { categories, error: '' }); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.categoryCode, 'plumbing');
});
test('unknown category is never silently broadened', () => { const f = fixture('?categoryCode=invented'); assert.equal(f.calls.length, 0); assert.match(f.alerts, /التصنيف المحدد غير متاح/); });
test('legacy category normalization retains filters and issues only one request', () => {
  const f = fixture('?category=plumbing&cityCode=damascus&q=repair&page=2'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].input.categoryCode, 'plumbing'); assert.equal(f.calls[0].input.cityCode, 'damascus'); assert.equal(f.calls[0].input.page, 2);
  assert.equal(f.location.searchParams.get('category'), null); assert.equal(f.location.searchParams.get('categoryCode'), 'plumbing');
});
test('canonical category overrides the alias including an explicit empty value', () => {
  const f = fixture('?type=service&category=plumbing&categoryCode=electrical'); assert.equal(f.calls[0].input.categoryCode, 'electrical');
  const cleared = fixture('?type=service&category=plumbing&categoryCode='); assert.equal(cleared.calls[0].input.categoryCode, undefined);
});
test('submit updates URL then issues one request, not an event/effect double request', () => {
  const f = fixture(); f.edit('q', 'repair'); f.edit('city', 'aleppo'); f.edit('category', 'plumbing'); f.submit();
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].input, { q: 'repair', cityCode: 'aleppo', categoryCode: 'plumbing', page: 1, type: 'all' });
});
test('explicit empty submission searches while plain /search remains a landing', () => { const f = fixture(); f.submit(); assert.equal(f.calls.length, 1); assert.equal(f.location.searchParams.get('type'), 'all'); });
test('resubmitting identical filters retries once without another history entry', async () => {
  const f = fixture('?type=business&q=repair'); await finish(f); const n = f.navigations.filter((x) => x.mode === 'push').length; f.submit(); assert.equal(f.calls.length, 2); assert.equal(f.navigations.filter((x) => x.mode === 'push').length, n);
});
test('editing a field does not fetch or change the applied results', async () => {
  const f = fixture('?type=business&cityCode=damascus'); await finish(f, 'دمشق'); f.edit('city', 'aleppo'); assert.equal(f.calls.length, 1); assert.deepEqual(f.titles, ['دمشق']); assert.equal(f.location.searchParams.get('cityCode'), 'damascus');
});
test('pagination uses applied filters rather than unsubmitted field edits', async () => {
  const f = fixture('?type=service&cityCode=damascus&categoryCode=plumbing&q=repair'); await finish(f, 'نتيجة', f.calls[0], 20, 21);
  f.edit('city', 'aleppo'); f.click('التالي'); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].input.cityCode, 'damascus'); assert.equal(f.calls[1].input.page, 2); assert.equal(f.values.city, 'damascus');
});
test('back and forward restore all filters and page together', async () => {
  const f = fixture('?type=business&cityCode=damascus&categoryCode=plumbing&q=repair'); await finish(f);
  f.edit('city', 'aleppo'); f.submit(); await finish(f); f.back(); assert.equal(f.values.city, 'damascus'); assert.equal(f.calls.at(-1).input.cityCode, 'damascus');
  await finish(f); f.forward(); assert.equal(f.values.city, 'aleppo'); assert.equal(f.calls.at(-1).input.cityCode, 'aleppo');
});
test('Back to landing clears inputs and never retains the previous results', async () => {
  const f = fixture(); f.edit('q', 'repair'); f.submit(); await finish(f, 'قديم'); f.back(); assert.equal(f.values.q, ''); assert.deepEqual(f.titles, []); assert.equal(f.busy, false);
});
test('clear preserves a Back path but no in-flight result can repopulate the landing', async () => {
  const f = fixture('?q=repair'); const old = f.calls[0]; f.click('مسح'); await finish(f, 'قديم', old);
  assert.equal(f.location.search, ''); assert.deepEqual(f.titles, []); assert.equal(f.busy, false); f.back(); assert.equal(f.calls.length, 2);
});
for (const completion of ['resolve', 'reject']) test(`older ${completion} cannot change newer results or error`, async () => {
  const f = fixture('?type=business&cityCode=damascus'); const old = f.calls[0]; f.navigate('?type=business&cityCode=aleppo'); await finish(f, 'حديث');
  completion === 'resolve' ? old.resolve(response('business', 'قديم')) : old.reject(new Error('خطأ قديم')); await f.flush();
  assert.deepEqual(f.titles, ['حديث']); assert.equal(f.alerts, ''); assert.equal(f.busy, false);
});
test('old completion cannot end loading while the new request is pending', async () => {
  const f = fixture('?type=business&cityCode=damascus'); const old = f.calls[0]; f.navigate('?type=business&cityCode=aleppo'); await finish(f, 'قديم', old); assert.equal(f.busy, true); assert.deepEqual(f.titles, []);
});
test('current failure hides stale results and explicit retry retains context', async () => {
  const f = fixture('?type=business&cityCode=damascus'); await finish(f, 'قديم'); f.navigate('?type=business&cityCode=aleppo'); f.calls.at(-1).reject(new Error('network')); await f.flush();
  assert.equal(f.busy, false); assert.deepEqual(f.titles, []); assert.match(f.alerts, /network/); f.click('إعادة المحاولة'); assert.equal(f.calls.at(-1).input.cityCode, 'aleppo'); await finish(f, 'حديث'); assert.deepEqual(f.titles, ['حديث']);
});
test('unmount ignores late result, error and finally', async () => {
  const f = fixture('?q=repair'); f.unmount(); f.calls[0].resolve(response('all', 'late')); await new Promise(setImmediate); assert.equal(f.writesAfterUnmount, 0);
});
test('development effect replay ignores the discarded request', async () => {
  const f = fixture('?type=business&q=repair'); const old = f.calls[0]; f.replayEffects(); assert.equal(f.calls.length, 2); await finish(f, 'حديث'); await finish(f, 'قديم', old); assert.deepEqual(f.titles, ['حديث']);
});
test('professional tab clears unsupported category while retaining keyword and city', () => {
  const f = fixture('?type=professional&categoryCode=plumbing&cityCode=aleppo&q=repair'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].kind, 'professional'); assert.equal(f.calls[0].input.categoryCode, undefined); assert.equal(f.calls[0].input.cityCode, 'aleppo'); assert.equal(f.location.searchParams.get('categoryCode'), null);
});
test('changing tabs issues one request to the matching API and resets page', async () => {
  const f = fixture('?type=service&cityCode=aleppo&categoryCode=plumbing&page=2'); await finish(f); f.click('المهنيون');
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].kind, 'professional'); assert.equal(f.calls[1].input.page, 1); assert.equal(f.calls[1].input.categoryCode, undefined);
});
test('professional summary never reports the current page as the global total', async () => {
  const f = fixture('?type=professional&cityCode=aleppo'); await finish(f, 'مهني', f.calls[0], 20); assert.match(f.summary, /20 نتيجة في هذه الصفحة/); f.click('التالي'); assert.equal(f.calls.at(-1).input.page, 2);
});
test('invalid type normalizes once without multiplying requests', () => { const f = fixture('?type=invented&q=repair'); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].kind, 'all'); assert.equal(f.location.searchParams.get('type'), 'all'); });
test('metadata arrival unrelated to selected filters does not repeat the request or overwrite edits', async () => {
  const f = fixture('?q=repair', { cities: { cities: [], isLoading: true }, categories: { categories: [], isLoading: true } }); assert.equal(f.calls.length, 1); await finish(f);
  f.edit('q', 'draft'); f.setMetadata('cities', { cities, isLoading: false }); f.setMetadata('categories', { categories, isLoading: false }); assert.equal(f.calls.length, 1); assert.equal(f.values.q, 'draft');
});
test('unsafe pages normalize to one and exact endpoint totals use twenty, not twelve', () => {
  for (const value of ['0', '-2', '1.5', 'Infinity', '9007199254740992', '2x']) {
    assert.equal(helpers.readSearchState(new URLSearchParams(`page=${value}`)).page, 1);
  }
  for (const tab of ['business','service']) assert.deepEqual(normalize(helpers.searchPagination(tab, 1, 21, { businesses: 20, services: 0, professionals: 0 })), { totalPages: 2, canNext: true });
});
test('combined totals and professional page counts never generate fictional numbered pages', () => {
  assert.equal(helpers.searchPagination('all', 1, 40, { businesses: 20, services: 20, professionals: 0 }).totalPages, null);
  assert.equal(helpers.searchPagination('all', 1, 40, { businesses: 20, services: 20, professionals: 0 }).canNext, false);
  assert.equal(helpers.searchPagination('all', 1, 41, { businesses: 20, services: 20, professionals: 0 }).canNext, true);
  assert.equal(helpers.searchPagination('professional', 1, 0, { businesses: 0, services: 0, professionals: 20 }).canNext, true);
  assert.equal(helpers.searchPagination('professional', 2, 0, { businesses: 0, services: 0, professionals: 0 }).canNext, false);
});
test('search writer preserves unrelated query data and uses encoded canonical local parameters', () => {
  const href = helpers.searchHref({ q: 'إصلاح & test', cityCode: 'aleppo', categoryCode: 'plumbing', page: 2, tab: 'service' }, new URLSearchParams('category=old&source=directory'));
  const url = new URL(href, 'https://fixture.example.test'); assert.equal(url.pathname, '/search'); assert.equal(url.searchParams.get('q'), 'إصلاح & test'); assert.equal(url.searchParams.get('source'), 'directory'); assert.equal(url.searchParams.get('category'), null); assert.equal(url.searchParams.get('categoryCode'), 'plumbing');
});

test('a rejected city change cannot be overwritten by a pending valid-city response', async () => {
  const f = fixture('?type=business&cityCode=damascus'); const old = f.calls[0];
  f.navigate('?type=business&cityCode=invented'); await finish(f, 'قديم', old);
  assert.match(f.alerts, /المدينة المحددة غير متاحة/); assert.deepEqual(f.titles, []); assert.equal(f.calls.length, 1);
});
test('all six response orders preserve the last of three submitted contexts', async () => {
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const f = fixture('?type=business&q=first'); f.navigate('?type=business&q=second'); f.navigate('?type=business&q=third');
    for (const index of order) await finish(f, ['first','second','third'][index], f.calls[index]);
    assert.deepEqual(f.titles, ['third'], `response order ${order}`); assert.equal(f.busy, false);
  }
});
