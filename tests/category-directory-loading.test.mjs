import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

const directorySource = readFileSync(new URL('../apps/frontend/app/components/category-directory.tsx', import.meta.url), 'utf8');
const contextSource = readFileSync(new URL('../apps/frontend/lib/discovery-context.ts', import.meta.url), 'utf8');
const categoriesSource = readFileSync(new URL('../apps/frontend/lib/use-categories.ts', import.meta.url), 'utf8');
const categories = [
  { code: 'plumbing', nameAr: 'السباكة' },
  { code: 'electrical', nameAr: 'الكهرباء' }
];
const serviceResult = (title, page = 1, total = 1) => ({
  services: [{ id: title, titleAr: title, ownerId: 'test-provider', ownerType: 'business' }], page, total
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Source-level lifecycle tests, not a substitute for browser/React DOM tests.
// Execute the actual hook and component with controlled requests and a small
// hook scheduler: stable state/ref slots, Object.is dependencies, effect cleanup,
// queued state commits, and development-style setup/cleanup replay. Rendering
// adapters are inert: these tests exercise request ownership, not CSS or layout.
function fixture({ query = '', hookOnly = false } = {}) {
  const slots = [], pendingEffects = new Map(), categoryCalls = [], serviceCalls = [];
  let cursor = 0, dirty = true, mounted = true, writesAfterUnmount = 0, output, currentCategories;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, (next) => {
        if (!mounted) { writesAfterUnmount += 1; return; }
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef(value) {
      const index = cursor++;
      return (slots[index] ??= { current: value });
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].dependencies, dependencies)) slots[index] = { value: callback, dependencies };
      return slots[index].value;
    },
    useEffect(setup, dependencies) {
      const index = cursor++;
      const slot = slots[index] ??= {};
      if (!equal(slot.dependencies, dependencies)) {
        slot.dependencies = dependencies;
        slot.setup = setup;
        pendingEffects.set(index, setup);
      }
    }
  };
  const location = new URL(`/categories${query}`, 'https://fixture.example.test');
  const historyEntries = [location.href];
  let historyIndex = 0;
  const navigations = [];
  function navigate(path, mode = 'push') {
    location.href = new URL(path, location).href;
    if (mode === 'push') { historyEntries.splice(historyIndex + 1); historyEntries.push(location.href); historyIndex += 1; }
    else historyEntries[historyIndex] = location.href;
    navigations.push(mode); dirty = true;
  }
  const router = { push: (path) => navigate(path), replace: (path) => navigate(path, 'replace') };
  const window = { location, scrollTo() {}, history: {
    replaceState(_state, _unused, path) { location.href = new URL(path, location).href; }
  } };
  const api = {
    categories: { list() { const call = deferred(); categoryCalls.push(call); return call.promise; } },
    services: { search(input) { const call = { ...deferred(), input }; serviceCalls.push(call); return call.promise; } }
  };
  const jsx = (type, props) => ({ type, props });
  const primitives = Object.fromEntries(['ActionButton', 'ActionLink', 'EmptyState', 'PageHeader', 'PageShell', 'SkeletonGrid', 'StatusMessage'].map((name) => [name, name]));
  function load(source, name, adapters) {
    const compiled = ts.transpileModule(source, { fileName: name, reportDiagnostics: true, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
    } });
    assert.deepEqual((compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error), []);
    const exports = {};
    const context = createContext({ exports, window, URLSearchParams, Number, Error,
      require(id) {
        if (id in adapters) return adapters[id];
        if (id === 'react') return hooks;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
        if (id.endsWith('/api-client')) return { api };
        throw new Error(`Unexpected dependency in lifecycle test: ${id}`);
      }
    });
    new Script(compiled.outputText, { filename: name }).runInContext(context);
    return exports;
  }
  const contextHelpers = load(contextSource, 'discovery-context.ts', {});
  const { useCategories } = load(categoriesSource, 'use-categories.ts', {});
  const { CategoryDirectory } = load(directorySource, 'category-directory.tsx', {
    'next/navigation': { useSearchParams: () => new URLSearchParams(location.search), useRouter: () => router },
    '../../lib/discovery-context': contextHelpers,
    'next/link': 'Link', './platform-icon': { PlatformIcon: 'PlatformIcon' }, './ui-primitives': primitives,
    '../../lib/use-categories': { useCategories() { currentCategories = useCategories(); return currentCategories; } }
  });
  const render = (effects = true) => {
    let rounds = 0;
    do {
      dirty = false; cursor = 0;
      output = hookOnly ? useCategories() : CategoryDirectory();
      if (!effects) return output;
      const pending = [...pendingEffects]; pendingEffects.clear();
      for (const [index, setup] of pending) {
        slots[index].cleanup?.();
        slots[index].cleanup = setup();
      }
      assert.ok(++rounds < 40, 'effects must settle without a render loop');
    } while (dirty);
    return output;
  };
  function* walk(value) {
    if (Array.isArray(value)) { for (const child of value) yield* walk(child); }
    else if (value && typeof value === 'object' && 'type' in value) {
      yield value; yield* walk(value.props?.children); yield* walk(value.props?.actions);
    }
  }
  const text = (node) => Array.isArray(node) ? node.map(text).join('')
    : node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
  const all = () => [...walk(output)];
  const button = (label) => {
    const found = all().find((node) => ['button', 'ActionButton'].includes(node.type) && (text(node) === label || node.props?.['aria-label'] === label));
    assert.ok(found, `button is present: ${label}`);
    assert.ok(!found.props.disabled, `button is enabled: ${label}`);
    return found;
  };
  render();
  return {
    categoryCalls, serviceCalls, location, render, navigations,
    navigate(query) { navigate(`/categories${query}`); render(); },
    back() { if (historyIndex > 0) { location.href = historyEntries[--historyIndex]; dirty = true; render(); } },
    forward() { if (historyIndex + 1 < historyEntries.length) { location.href = historyEntries[++historyIndex]; dirty = true; render(); } },
    get header() { return all().find((node) => node.type === 'PageHeader')?.props.title; },
    get value() { return output; }, get writesAfterUnmount() { return writesAfterUnmount; },
    get busy() { return hookOnly ? output.isLoading : all().some((node) => node.type === 'SkeletonGrid'); },
    get alerts() { return all().filter((node) => node.type === 'StatusMessage').map(text).join('|'); },
    get titles() { return all().filter((node) => node.type === 'h2').map(text); },
    click(label) { button(label).props.onClick(); render(); },
    async flush() { await new Promise(setImmediate); render(); await new Promise(setImmediate); render(); },
    retryRegistry() { (hookOnly ? output : currentCategories).retry(); render(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); mounted = false; },
    replayEffects() {
      for (const slot of slots) if (slot.setup) slot.cleanup?.();
      for (const slot of slots) if (slot.setup) slot.cleanup = slot.setup();
      render();
    }
  };
}

async function loadedRegistry(query = '') {
  const f = fixture({ query });
  f.categoryCalls[0].resolve({ categories }); await f.flush();
  return f;
}
function choose(f, name) {
  f.click('تصفية الخدمات'); f.click(name);
}

test('directory stays busy and sends no service request before the registry settles', () => {
  const f = fixture({ query: '?category=plumbing' });
  assert.equal(f.categoryCalls.length, 1); assert.equal(f.serviceCalls.length, 0); assert.equal(f.busy, true);
});

test('initial selection and page are applied once, without an unfiltered preliminary request', async () => {
  const f = await loadedRegistry('?category=plumbing&page=2');
  assert.equal(f.serviceCalls.length, 1);
  assert.equal(f.serviceCalls[0].input.categoryCode, 'plumbing'); assert.equal(f.serviceCalls[0].input.page, 2);
  assert.equal(f.busy, true);
  f.serviceCalls[0].resolve(serviceResult('selected', 2, 40)); await f.flush();
  assert.equal(f.busy, false); assert.deepEqual(f.titles, ['selected']);
});

test('unfiltered entry fetches once after registry success, including a valid empty registry', async () => {
  const f = fixture(); f.categoryCalls[0].resolve({ categories: [] }); await f.flush();
  assert.equal(f.serviceCalls.length, 1); assert.equal(f.serviceCalls[0].input.categoryCode, undefined);
  f.serviceCalls[0].resolve({ services: [], page: 1, total: 0 }); await f.flush();
  assert.equal(f.busy, false); assert.equal(f.alerts, '');
});

test('registry failure is retryable, preserves the URL and does not silently run an unfiltered query', async () => {
  const f = fixture({ query: '?category=plumbing&page=3' });
  f.categoryCalls[0].reject(new Error('offline')); await f.flush();
  assert.equal(f.serviceCalls.length, 0); assert.equal(f.busy, false);
  assert.match(f.alerts, /تعذر تحميل التصنيفات/);
  f.click('إعادة تحميل التصنيفات');
  assert.equal(f.busy, true); assert.equal(f.location.search, '?category=plumbing&page=3');
  f.categoryCalls[1].resolve({ categories }); await f.flush();
  assert.equal(f.serviceCalls.length, 1); assert.equal(f.serviceCalls[0].input.categoryCode, 'plumbing');
  assert.equal(f.serviceCalls[0].input.page, 3);
});

test('an older success cannot replace the newest category results or pagination', async () => {
  const f = await loadedRegistry(); const old = f.serviceCalls.at(-1);
  choose(f, 'السباكة'); const current = f.serviceCalls.at(-1);
  current.resolve(serviceResult('new')); await f.flush();
  old.resolve(serviceResult('old', 9, 180)); await f.flush();
  assert.deepEqual(f.titles, ['new']); assert.equal(f.busy, false); assert.equal(f.alerts, '');
  assert.equal(f.location.search, '?categoryCode=plumbing');
});

for (const outcome of ['resolve', 'reject']) {
  test(`an older ${outcome} cannot clear busy or display stale content while the newest request is pending`, async () => {
    const f = await loadedRegistry(); const old = f.serviceCalls.at(-1);
    choose(f, 'السباكة'); const current = f.serviceCalls.at(-1);
    old[outcome](outcome === 'resolve' ? serviceResult('old') : new Error('old-error')); await f.flush();
    assert.equal(f.busy, true); assert.equal(f.alerts, ''); assert.deepEqual(f.titles, []);
    current.resolve(serviceResult('new')); await f.flush();
    assert.deepEqual(f.titles, ['new']); assert.equal(f.busy, false);
  });
}

test('an old rejection cannot overwrite a newer successful response', async () => {
  const f = await loadedRegistry(); const old = f.serviceCalls.at(-1);
  choose(f, 'الكهرباء'); f.serviceCalls.at(-1).resolve(serviceResult('current')); await f.flush();
  old.reject(new Error('stale-error')); await f.flush();
  assert.equal(f.alerts, ''); assert.deepEqual(f.titles, ['current']);
});

test('the current failure stops loading and retry keeps the selected category and page', async () => {
  const f = await loadedRegistry('?category=electrical&page=2');
  f.serviceCalls.at(-1).reject(new Error('current-error')); await f.flush();
  assert.equal(f.busy, false); assert.match(f.alerts, /current-error/);
  f.click('إعادة المحاولة'); assert.equal(f.busy, true);
  assert.equal(f.serviceCalls.at(-1).input.categoryCode, 'electrical'); assert.equal(f.serviceCalls.at(-1).input.page, 2);
  f.serviceCalls.at(-1).resolve(serviceResult('retried', 2)); await f.flush();
  assert.equal(f.busy, false); assert.equal(f.alerts, ''); assert.deepEqual(f.titles, ['retried']);
});

test('late service completion cannot write state after unmount', async () => {
  const f = await loadedRegistry(); f.unmount();
  f.serviceCalls.at(-1).resolve(serviceResult('late')); await new Promise(setImmediate);
  assert.equal(f.writesAfterUnmount, 0);
});

test('refreshing the registry never creates a ready frame before the matching services settle', async () => {
  const f = await loadedRegistry('?category=plumbing');
  f.serviceCalls.at(-1).resolve(serviceResult('previous')); await f.flush(); assert.equal(f.busy, false);
  f.retryRegistry(); assert.equal(f.busy, true);
  f.categoryCalls.at(-1).resolve({ categories: [...categories] });
  await new Promise(setImmediate);
  f.render(false); assert.equal(f.busy, true, 'render before effects must still be busy for the new registry');
  f.render(); assert.equal(f.busy, true);
  f.serviceCalls.at(-1).resolve(serviceResult('refreshed')); await f.flush();
  assert.equal(f.busy, false); assert.deepEqual(f.titles, ['refreshed']);
});

test('unsafe, fractional and infinite page inputs normalize to page one', async () => {
  for (const page of ['0', '-1', '1.5', 'Infinity', 'NaN', '9007199254740992']) {
    const f = await loadedRegistry(`?category=plumbing&page=${page}`);
    assert.equal(f.serviceCalls.at(-1).input.page, 1, page);
    f.unmount();
  }
});

test('metadata refresh ignores an older successful registry response', async () => {
  const f = fixture({ hookOnly: true }); f.retryRegistry();
  f.categoryCalls[1].resolve({ categories: [categories[1]] }); await f.flush();
  f.categoryCalls[0].resolve({ categories: [categories[0]] }); await f.flush();
  assert.equal(f.value.categories[0].code, 'electrical'); assert.equal(f.busy, false);
});

test('metadata refresh ignores an older failure and keeps the current request busy', async () => {
  const f = fixture({ hookOnly: true }); f.retryRegistry();
  f.categoryCalls[0].reject(new Error('old')); await f.flush();
  assert.equal(f.busy, true); assert.equal(f.value.error, '');
  f.categoryCalls[1].resolve({ categories }); await f.flush(); assert.equal(f.busy, false);
});

test('metadata completion after unmount cannot mutate state', async () => {
  const f = fixture({ hookOnly: true }); f.unmount();
  f.categoryCalls[0].reject(new Error('offline')); await new Promise(setImmediate);
  assert.equal(f.writesAfterUnmount, 0);
});

test('effect setup/cleanup replay ignores the discarded metadata request', async () => {
  const f = fixture(); f.replayEffects();
  assert.equal(f.categoryCalls.length, 2); assert.equal(f.serviceCalls.length, 0);
  f.categoryCalls[0].resolve({ categories: [categories[0]] }); await f.flush();
  assert.equal(f.serviceCalls.length, 0); assert.equal(f.busy, true);
  f.categoryCalls[1].resolve({ categories }); await f.flush(); assert.equal(f.serviceCalls.length, 1);
});


// B1.1: controlled routing integration. Next adapters are simulated here;
// real browser navigation remains a separate acceptance check.
test('canonical category and city are applied on entry without an unfiltered request', async () => {
  const f = await loadedRegistry('?categoryCode=electrical&cityCode=aleppo&q=repair&page=2');
  assert.equal(f.serviceCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.serviceCalls[0].input)), {
    categoryCode: 'electrical', cityCode: 'aleppo', q: 'repair', page: 2
  });
  assert.equal(f.header, 'الكهرباء');
});

test('canonical category takes precedence over an old alias, including explicit clearing', async () => {
  for (const [query, expected] of [
    ['?categoryCode=electrical&category=plumbing', 'electrical'],
    ['?categoryCode=&category=plumbing', undefined]
  ]) {
    const f = await loadedRegistry(query);
    assert.equal(f.serviceCalls.length, 1); assert.equal(f.serviceCalls[0].input.categoryCode, expected);
    f.unmount();
  }
});

test('category selection emits canonical URL, keeps query/city and requests only once', async () => {
  const f = await loadedRegistry('?category=plumbing&cityCode=homs&q=repair&page=3&source=discovery');
  f.serviceCalls[0].resolve(serviceResult('original', 3, 80)); await f.flush();
  choose(f, 'الكهرباء');
  const params = f.location.searchParams;
  assert.equal(params.get('categoryCode'), 'electrical'); assert.equal(params.has('category'), false);
  assert.equal(params.get('cityCode'), 'homs'); assert.equal(params.get('q'), 'repair');
  assert.equal(params.get('source'), 'discovery'); assert.equal(params.has('page'), false);
  assert.equal(f.serviceCalls.length, 2); assert.equal(f.serviceCalls.at(-1).input.cityCode, 'homs');
  assert.equal(f.serviceCalls.at(-1).input.page, 1); assert.equal(f.navigations.at(-1), 'push');
});

test('back and forward restore category, page, city and result request together', async () => {
  const f = await loadedRegistry('?category=plumbing&cityCode=aleppo&page=2');
  f.serviceCalls[0].resolve(serviceResult('page-two', 2, 80)); await f.flush();
  choose(f, 'الكهرباء');
  f.serviceCalls.at(-1).resolve(serviceResult('electrical')); await f.flush();
  f.back();
  assert.equal(f.header, 'السباكة'); assert.equal(f.busy, true);
  assert.equal(f.serviceCalls.length, 3);
  assert.equal(f.serviceCalls.at(-1).input.categoryCode, 'plumbing');
  assert.equal(f.serviceCalls.at(-1).input.page, 2); assert.equal(f.serviceCalls.at(-1).input.cityCode, 'aleppo');
  f.serviceCalls.at(-1).resolve(serviceResult('restored', 2, 80)); await f.flush();
  assert.deepEqual(f.titles, ['restored']);
  f.forward();
  assert.equal(f.header, 'الكهرباء'); assert.equal(f.serviceCalls.length, 4);
  assert.equal(f.serviceCalls.at(-1).input.categoryCode, 'electrical'); assert.equal(f.serviceCalls.at(-1).input.page, 1);
});

test('pagination and retry retain query, city and canonical category', async () => {
  const f = await loadedRegistry('?categoryCode=plumbing&cityCode=homs&q=repair');
  f.serviceCalls[0].resolve(serviceResult('one', 1, 60)); await f.flush();
  f.click('التالي');
  assert.equal(f.location.searchParams.get('page'), '2');
  assert.equal(f.serviceCalls.length, 2);
  f.serviceCalls.at(-1).reject(new Error('offline')); await f.flush();
  f.click('إعادة المحاولة');
  assert.deepEqual(JSON.parse(JSON.stringify(f.serviceCalls.at(-1).input)), {
    categoryCode: 'plumbing', cityCode: 'homs', q: 'repair', page: 2
  });
});

test('alias-only normalization does not trigger a second request or permanent loading', async () => {
  const f = await loadedRegistry('?category=plumbing&cityCode=aleppo');
  f.serviceCalls[0].resolve(serviceResult('loaded')); await f.flush();
  choose(f, 'السباكة');
  assert.equal(f.location.searchParams.has('category'), false);
  assert.equal(f.location.searchParams.get('categoryCode'), 'plumbing');
  assert.equal(f.serviceCalls.length, 1); assert.equal(f.busy, false);
  assert.equal(f.navigations.at(-1), 'replace');
});

test('an unknown category is not silently broadened, and explicit reset preserves city', async () => {
  const f = await loadedRegistry('?categoryCode=missing&cityCode=aleppo');
  assert.equal(f.serviceCalls.length, 0); assert.equal(f.busy, false);
  assert.match(f.alerts, /التصنيف المحدد غير متاح/);
  assert.equal(f.location.searchParams.get('categoryCode'), 'missing');
  f.click('عرض كل التصنيفات');
  assert.equal(f.serviceCalls.length, 1);
  assert.equal(f.serviceCalls[0].input.categoryCode, undefined);
  assert.equal(f.serviceCalls[0].input.cityCode, 'aleppo');
});

test('city-only URL changes invalidate old responses and never display the wrong city results', async () => {
  const f = await loadedRegistry('?categoryCode=plumbing&cityCode=aleppo');
  const old = f.serviceCalls.at(-1);
  f.navigate('?categoryCode=plumbing&cityCode=homs');
  const current = f.serviceCalls.at(-1);
  assert.equal(f.serviceCalls.length, 2); assert.equal(current.input.cityCode, 'homs');
  old.resolve(serviceResult('wrong-city')); await f.flush();
  assert.equal(f.busy, true); assert.deepEqual(f.titles, []);
  current.resolve(serviceResult('homs')); await f.flush();
  assert.deepEqual(f.titles, ['homs']); assert.equal(f.busy, false);
});

test('Back to the unfiltered URL clears the prior selection rather than retaining it', async () => {
  const f = await loadedRegistry();
  f.serviceCalls[0].resolve(serviceResult('all')); await f.flush();
  choose(f, 'الكهرباء'); f.serviceCalls.at(-1).resolve(serviceResult('one')); await f.flush();
  f.back();
  assert.equal(f.header, 'دليل الخدمات'); assert.equal(f.serviceCalls.at(-1).input.categoryCode, undefined);
  assert.equal(f.serviceCalls.at(-1).input.page, 1);
});

test('reloading an emitted canonical URL restores the identical API filter tuple', async () => {
  const f = await loadedRegistry('?category=plumbing&cityCode=aleppo&q=repair&page=2');
  f.serviceCalls[0].resolve(serviceResult('first', 2, 60)); await f.flush();
  f.click('التالي'); const expected = JSON.parse(JSON.stringify(f.serviceCalls.at(-1).input));
  const reloaded = await loadedRegistry(f.location.search);
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.serviceCalls[0].input)), expected);
});

test('invalid city errors are shown without retrying a broader request or deleting the URL context', async () => {
  const f = await loadedRegistry('?categoryCode=plumbing&cityCode=unknown');
  assert.equal(f.serviceCalls[0].input.cityCode, 'unknown');
  f.serviceCalls[0].reject(new Error('cityCode must identify a supported Syrian city.')); await f.flush();
  assert.match(f.alerts, /cityCode/); assert.equal(f.serviceCalls.length, 1); assert.equal(f.busy, false);
  assert.equal(f.location.searchParams.get('cityCode'), 'unknown');
});
