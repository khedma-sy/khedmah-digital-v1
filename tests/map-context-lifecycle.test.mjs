import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mapSource = read('apps/frontend/app/map/page.tsx');
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
    useCallback(callback, dependencies) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].dependencies, dependencies)) slots[i] = { value: callback, dependencies };
      return slots[i].value;
    },
    useEffect(setup, dependencies) {
      const i = cursor++, slot = slots[i] ??= {};
      if (!same(slot.dependencies, dependencies)) { slot.dependencies = dependencies; slot.setup = setup; effects.set(i, setup); }
    }
  };
  const location = new URL(`/map${query}`, 'https://fixture.example.test');
  const entries = [location.href]; let index = 0;
  const navigate = (href, mode = 'push') => {
    location.href = new URL(href, location).href;
    if (mode === 'push') { entries.splice(index + 1); entries.push(location.href); index++; }
    else entries[index] = location.href;
    navigations.push({ mode, href }); dirty = true;
  };
  let pendingNavigation;
  const route = (href, mode) => { if (options.delayedNavigation) pendingNavigation = { href, mode }; else navigate(href, mode); };
  const router = { push: (href) => route(href, 'push'), replace: (href) => route(href, 'replace') };
  let cachedQuery, cachedParams;
  function useSearchParams() {
    if (cachedQuery !== location.search) { cachedQuery = location.search; cachedParams = new URLSearchParams(cachedQuery); }
    return cachedParams;
  }
  const api = { search: { query(input) { const call = { ...deferred(), input: normalize(input) }; calls.push(call); return call.promise; } } };
  const timers = new Map(); let timerId = 0;
  const setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const maps = [], geolocationCalls = [], overlays = [];
  class FakeMap {
    constructor() { this.events = new Map(); this.bounds = { south: 33, west: 36, north: 34, east: 37 }; this.center = { lat: 33.5, lng: 36.5 }; this.fits = []; maps.push(this); }
    addListener(name, callback) { const callbacks = this.events.get(name) ?? new Set(); callbacks.add(callback); this.events.set(name, callbacks); return { remove: () => callbacks.delete(callback) }; }
    emit(name) { for (const cb of this.events.get(name) ?? []) cb(); }
    getBounds() { return { toJSON: () => this.bounds }; }
    getCenter() { return { lat: () => this.center.lat, lng: () => this.center.lng }; }
    fitBounds(bounds) { this.bounds = normalize(bounds); this.fits.push(this.bounds); this.emit('zoom_changed'); }
    panTo(point) { this.center = normalize(point); this.panned = true; }
  }
  class Overlay {
    constructor(opts) { this.map = opts.map; overlays.push(this); }
    setMap(map) { this.map = map; }
    addListener() { return { remove() {} }; }
  }
  const window = { setTimeout, clearTimeout, google: options.noMap ? undefined : { maps: {
    Map: FakeMap, Circle: Overlay, Marker: Overlay, InfoWindow: class { open() {} close() {} }
  } } };
  const navigator = { geolocation: options.noGeo ? undefined : { getCurrentPosition(resolve, reject) { geolocationCalls.push({ resolve, reject }); } } };
  const document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
  const jsx = (type, props) => ({ type, props });
  const primitives = Object.fromEntries(['PageShell','PageHeader','Surface','ActionButton','ActionLink','EmptyState','SkeletonGrid','StatusMessage'].map((name) => [name,name]));
  const module = load(`${mapSource}\nexport { MapDiscovery };`, 'page.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router, useSearchParams }, 'next/link': 'Link',
    '../../lib/api-client': { api }, '../../lib/search-context': helpers, '../../lib/map-context': mapHelpers,
    '../../lib/use-categories': { useCategories: () => categoryMetadata },
    '../../lib/use-syrian-cities': { useSyrianCities: () => cityMetadata,
      canonicalCityCode: (code, list) => list.some((city) => city.countryCode === 'SY' && city.code === code) ? code : '',
      cityLabel: (code, list) => list.find((city) => city.code === code)?.nameAr ?? '' },
    '../components/platform-icon': { PlatformIcon: 'PlatformIcon' },
    '../components/category-select-options': { CategorySelectOptions: 'CategorySelectOptions' },
    '../components/ui-primitives': primitives, '../discovery.module.css': new Proxy({}, { get: (_, key) => key })
  }, { window, navigator, document, setTimeout, clearTimeout, process: { env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: options.noMap ? '' : 'fixture-key' } } });
  function render(runEffects = true) {
    let rounds = 0;
    do {
      cursor = 0; dirty = false; output = module.MapDiscovery();
      for (const node of all()) if (node.props.ref) node.props.ref.current = {};
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
    const node = all().find((item) => ['button','ActionButton'].includes(item.type) && text(item).trim() === label);
    assert.ok(node, `button exists: ${label}`); assert.ok(!node.props.disabled, `button enabled: ${label}`); return node;
  }
  render();
  return {
    calls, location, navigations, render, maps, geolocationCalls, overlays,
    get busy() { return all().some((n) => n.props?.['aria-busy']); },
    get alerts() { return all().filter((n) => n.type === 'StatusMessage').map(text).join('|'); },
    get titles() { return all().filter((n) => n.type === 'h2' && !n.props.children?.includes?.('تعذر تشغيل الخريطة')).map(text); },
    get summary() { return all().filter((n) => n.props?.['aria-live'] === 'polite').map(text).join('|'); },
    get values() { return Object.fromEntries(all().filter((n) => ['input','select'].includes(n.type)).map((n) => [n.props.id, n.props.value])); },
    get writesAfterUnmount() { return writesAfterUnmount; },
    setMetadata(kind, patch) { if (kind === 'cities') cityMetadata = { ...cityMetadata, ...patch }; else categoryMetadata = { ...categoryMetadata, ...patch }; render(); },
    edit(value) { const node = all().find((n) => n.type === 'input'); assert.ok(node); node.props.onChange({ target: { value } }); render(); },
    click(label) { button(label).props.onClick?.(); render(); },
    submit() { all().find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    navigate(query) { navigate(`/map${query}`); render(); },
    back() { if (index > 0) { location.href = entries[--index]; render(); } },
    forward() { if (index + 1 < entries.length) { location.href = entries[++index]; render(); } },
    idle(bounds, gesture = true) {
      const map = maps.at(-1); if (bounds) map.bounds = bounds;
      if (gesture) map.emit('dragstart'); map.emit('idle'); render();
    },
    tick() { for (const [id, item] of [...timers]) if (item.delay === 300) { timers.delete(id); item.fn(); } render(); },
    commitNavigation() { assert.ok(pendingNavigation); navigate(pendingNavigation.href, pendingNavigation.mode); pendingNavigation = undefined; render(); },
    failMap() { window.gm_authFailure(); render(); },
    get link() { return all().find((n) => n.type === 'ActionLink' && text(n) === 'تعديل عوامل البحث').props.href; },
    unmount() { for (const slot of slots) slot.cleanup?.(); mounted = false; },
    replayEffects() { for (const slot of slots) if (slot.setup) slot.cleanup?.(); for (const slot of slots) if (slot.setup) slot.cleanup = slot.setup(); render(); },
    async flush() { await new Promise(setImmediate); render(); await new Promise(setImmediate); render(); }
  };
}

const response = (name, coords = {}) => ({ businesses: [{ id: name, name, cityCode: 'aleppo', categoryCode: 'plumbing', ...coords }], services: [], total: 1 });
async function finish(f, name = 'نتيجة', call = f.calls.at(-1), coords) { call.resolve(response(name, coords)); await f.flush(); }
const areaA = { south: 35, west: 36, north: 36, east: 37 };
const areaB = { south: 36, west: 37, north: 37, east: 38 };

test('map links carry encoded supported filters, drop list page/type and old bounds', () => {
  const href = mapHelpers.mapHref({ q: 'كهرباء & ماء', cityCode: 'aleppo', categoryCode: 'plumbing', page: 8, tab: 'professional' });
  const url = new URL(href, 'https://fixture.example.test');
  assert.equal(url.pathname, '/map'); assert.equal(url.searchParams.get('q'), 'كهرباء & ماء');
  assert.equal(url.searchParams.get('page'), null); assert.equal(url.searchParams.get('type'), null);
  assert.equal(url.searchParams.get('cityCode'), 'aleppo');
});
test('map bounds reject missing, empty, reversed, nonfinite and out-of-range values', () => {
  for (const query of ['south=&west=0&north=1&east=1', 'south=0', 'south=0&west=2&north=1&east=1', 'south=-91&west=0&north=1&east=1', 'south=0&west=-181&north=1&east=1', 'south=NaN&west=0&north=1&east=1', 'south=0&west=0&north=Infinity&east=1']) {
    assert.equal(mapHelpers.readMapContext(new URLSearchParams(query)).invalidBounds, true, query);
    const f = fixture('?' + query); assert.equal(f.calls.length, 0); assert.match(f.alerts, /حدود الخريطة/);
    f.click('مسح تحديد المنطقة'); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.boundaries, undefined);
  }
});
test('legacy category restores canonical filters once without requesting a fake user location or default-city bounds', () => {
  const f = fixture('?category=plumbing&cityCode=aleppo&q=repair&page=3');
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].input, { q: 'repair', cityCode: 'aleppo', categoryCode: 'plumbing', map: true, type: 'business' });
  assert.equal(f.location.searchParams.get('category'), null); assert.equal(f.location.searchParams.get('categoryCode'), 'plumbing');
  assert.equal(f.location.searchParams.get('page'), null);
});
test('metadata loading, failure and retry preserve filters without broadening the request', () => {
  const f = fixture('?cityCode=aleppo&categoryCode=plumbing', { cities: { cities: [], isLoading: true } });
  assert.equal(f.calls.length, 0); assert.equal(f.busy, true);
  f.setMetadata('cities', { isLoading: false, error: 'offline' }); assert.equal(f.calls.length, 0); assert.match(f.alerts, /المدينة/);
  f.setMetadata('cities', { cities, error: '' }); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.cityCode, 'aleppo');
  const g = fixture('?categoryCode=plumbing', { categories: { categories: [], error: 'offline' } });
  assert.equal(g.calls.length, 0); g.setMetadata('categories', { categories, error: '' }); assert.equal(g.calls.length, 1);
});
test('unknown governed filters never become broad map searches', () => {
  for (const query of ['?cityCode=unknown', '?categoryCode=unknown']) { const f = fixture(query); assert.equal(f.calls.length, 0); assert.equal(f.busy, false); assert.match(f.alerts, /غير متاح/); }
});
test('automatic provider fit centers the city results without triggering a default-area search', async () => {
  const f = fixture('?cityCode=aleppo'); await finish(f, 'حلب', undefined, { lat: 36.2, lng: 37.1 });
  assert.ok(f.maps[0].fits.at(-1).south > 36); f.idle(undefined, false); f.tick();
  assert.equal(f.calls.length, 1); assert.equal(f.location.searchParams.get('south'), null);
});
test('map idle uses latest applied query, ignores unsent edits, and retains city/category', async () => {
  const f = fixture('?q=first&cityCode=aleppo&categoryCode=plumbing'); await finish(f);
  f.edit('draft'); f.idle(areaA); f.tick(); assert.equal(f.calls.at(-1).input.q, 'first');
  f.submit(); assert.equal(f.calls.at(-1).input.q, 'draft'); await finish(f);
  f.idle(areaB); f.tick(); assert.equal(f.calls.at(-1).input.q, 'draft');
  assert.equal(f.calls.at(-1).input.cityCode, 'aleppo'); assert.equal(f.calls.at(-1).input.categoryCode, 'plumbing');
  assert.deepEqual(f.calls.at(-1).input.boundaries, areaB);
});
test('late success/failure cannot replace current results or write URL after a newer navigation', async () => {
  const f = fixture('?q=old'); const old = f.calls[0]; f.navigate('?q=new&cityCode=aleppo');
  await finish(f, 'حديث'); const href = f.location.href; old.resolve(response('قديم')); await f.flush();
  assert.ok(f.titles.some((name) => name.includes('حديث'))); assert.ok(!f.titles.some((name) => name.includes('قديم'))); assert.equal(f.location.href, href);
  f.navigate('?q=failing'); const failing = f.calls.at(-1); f.navigate('?q=latest'); await finish(f, 'الأحدث');
  failing.reject(new Error('stale error')); await f.flush(); assert.doesNotMatch(f.alerts, /stale error/); assert.equal(f.busy, false);
});
test('back/forward restore URL-owned filters and bounds and cancel pending idle work', async () => {
  const f = fixture('?q=first&south=35&west=36&north=36&east=37'); await finish(f);
  f.idle(areaB); f.navigate('?q=second&cityCode=aleppo'); f.tick(); assert.equal(f.location.searchParams.get('q'), 'second');
  f.back(); assert.equal(f.calls.at(-1).input.q, 'first'); assert.deepEqual(f.calls.at(-1).input.boundaries, areaA);
  f.forward(); assert.equal(f.calls.at(-1).input.cityCode, 'aleppo'); assert.equal(f.calls.at(-1).input.boundaries, undefined);
});
test('map failure and data failure are independently visible; result retry retains context', async () => {
  const f = fixture('?cityCode=aleppo&categoryCode=plumbing', { noMap: true }); f.calls[0].reject(new Error('data offline')); await f.flush();
  assert.match(f.alerts, /Google/); assert.match(f.alerts, /data offline/); assert.equal(f.busy, false);
  f.click('إعادة تحميل النتائج'); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].input.cityCode, 'aleppo'); await finish(f);
  assert.doesNotMatch(f.alerts, /data offline/); assert.match(f.alerts, /Google/);
});
test('geolocation requests no position before explicit click and waits for post-pan bounds', async () => {
  const f = fixture('?q=repair&cityCode=aleppo'); await finish(f);
  assert.equal(f.geolocationCalls.length, 0); assert.equal(f.calls[0].input.latitude, undefined);
  f.click('استخدم موقعي الحالي'); f.geolocationCalls[0].resolve({ coords: { latitude: 36.2, longitude: 37.1 } }); f.render();
  assert.equal(f.maps[0].panned, true); assert.equal(f.calls.length, 1, 'old bounds must not be queried during pan');
  f.idle(areaB, false); f.tick(); assert.equal(f.calls.at(-1).input.latitude, 36.2); assert.deepEqual(f.calls.at(-1).input.boundaries, areaB);
});
test('unsupported or denied geolocation offers manual recovery and never fabricates coordinates', async () => {
  const f = fixture('', { noGeo: true }); await finish(f); f.click('استخدم موقعي الحالي'); assert.match(f.alerts, /غير مدعوم/); assert.equal(f.calls.length, 1);
  const g = fixture('?cityCode=aleppo'); await finish(g); g.click('استخدم موقعي الحالي'); g.geolocationCalls[0].reject(); g.render();
  assert.match(g.alerts, /تعذر الوصول/); assert.equal(g.calls.at(-1).input.latitude, undefined);
});
test('geolocation completion after navigation or unmount cannot overwrite the new context', async () => {
  const f = fixture('?q=first'); await finish(f); f.click('استخدم موقعي الحالي'); f.navigate('?q=second');
  const count = f.calls.length; f.geolocationCalls[0].resolve({ coords: { latitude: 36, longitude: 37 } }); f.render();
  assert.equal(f.calls.length, count); assert.equal(f.maps[0].panned, undefined);
  f.click('استخدم موقعي الحالي'); f.unmount(); f.geolocationCalls.at(-1).reject(); assert.equal(f.writesAfterUnmount, 0);
});
test('map listener/overlay cleanup and late request completion remain safe across replay and unmount', async () => {
  const f = fixture(); await finish(f, 'مقدم', undefined, { lat: 36, lng: 37 });
  assert.ok(f.overlays.some((item) => item.map)); const old = f.maps[0]; f.replayEffects();
  assert.ok([...old.events.values()].every((items) => items.size === 0));
  const pending = f.calls.at(-1); f.unmount(); pending.resolve(response('late')); await new Promise(setImmediate);
  assert.equal(f.writesAfterUnmount, 0); assert.ok(f.overlays.every((item) => item.map === null));
  assert.ok(f.maps.every((map) => [...map.events.values()].every((items) => items.size === 0)));
});
test('return to manual search carries filters but no map pagination or geographic bounds', () => {
  const f = fixture('?q=repair&cityCode=aleppo&categoryCode=plumbing&south=35&west=36&north=36&east=37');
  const url = new URL(f.link, 'https://fixture.example.test'); assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('type'), 'business'); assert.equal(url.searchParams.get('cityCode'), 'aleppo');
  assert.equal(url.searchParams.get('south'), null); assert.equal(url.searchParams.get('page'), null);
});

test('an area response arriving during a gesture cannot refit the old area or publish old results', async () => {
  const f = fixture('?south=35&west=36&north=36&east=37');
  const old = f.calls[0]; f.idle(areaB); await finish(f, 'قديم', old, { lat: 35.5, lng: 36.5 });
  assert.deepEqual(f.maps[0].bounds, areaB); assert.ok(!f.titles.some((name) => name.includes('قديم')));
  f.tick(); assert.deepEqual(f.calls.at(-1).input.boundaries, areaB); await finish(f, 'حديث'); assert.equal(f.busy, false);
});

test('keyboard pan updates bounds without depending on a dragstart event', async () => {
  const f = fixture(); await finish(f); f.idle(undefined, false);
  f.maps[0].bounds = areaB; f.maps[0].emit('bounds_changed'); f.idle(undefined, false); f.tick();
  assert.deepEqual(f.calls.at(-1).input.boundaries, areaB);
});

test('an unsupported viewport stops loading and offers explicit recovery without an invalid API request', async () => {
  const f = fixture(); f.idle({ south: -90, north: 90, west: 170, east: -170 }); f.tick();
  assert.equal(f.busy, false); assert.equal(f.calls.length, 1); assert.match(f.alerts, /حدود البحث المدعومة/);
  f.click('مسح تحديد المنطقة'); assert.equal(f.calls.length, 2); await finish(f); assert.equal(f.busy, false);
});


test('delayed Next navigation never combines new GPS coordinates with the previous viewport', async () => {
  const f = fixture('?cityCode=aleppo&south=35&west=36&north=36&east=37', { delayedNavigation: true });
  await finish(f); f.click('استخدم موقعي الحالي');
  f.geolocationCalls[0].resolve({ coords: { latitude: 36.2, longitude: 37.1 } }); f.render();
  f.idle(areaB, false); f.tick();
  assert.equal(f.calls.length, 1, 'a new origin must wait for the URL with its new bounds');
  assert.equal(f.busy, true); f.commitNavigation();
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].input.boundaries, areaB);
  assert.equal(f.calls[1].input.latitude, 36.2); await finish(f); assert.equal(f.busy, false);
});
