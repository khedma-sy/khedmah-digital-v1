import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';

// Execute repository TSX. Router, network, GPS and SDK events are controlled;
// these tests are not Google Maps availability, real GPS, CSS or browser acceptance.
function fixture({ query = '', key = false, unsupported = false, geocode = false } = {}) {
  let params = new URLSearchParams(query);
  const requests = [], gps = [], geocodes = [], navigations = [], opens = [], handles = [], scripts = [], timers = new Map();
  let timerId = 0;
  const setTimeout = (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; };
  const clearTimeout = id => timers.delete(id);
  const runtime = { location: { search: query ? `?${query}` : '' }, setTimeout, clearTimeout,
    open: (...args) => opens.push(args), scrollTo() {},
    history: { pushState: (_, __, href) => navigations.push(href), replaceState: (_, __, href) => navigations.push(href) } };
  class Autocomplete {
    constructor(node) { this.node = node; this.events = new Map(); handles.push(this); }
    addListener(name, callback) { this.events.set(name, callback); return { remove: () => this.events.delete(name) }; }
    getPlace() { return this.place; }
    unbindAll() { this.unbound = true; }
  }
  const maps = { places: { Autocomplete }, ...(geocode ? { Geocoder: class { geocode(input, callback) { geocodes.push({ input, callback }); } } } : {}) };
  if (geocode && !key) runtime.google = { maps };
  const document = { getElementById: id => scripts.find(item => item.id === id) ?? null,
    createElement: () => ({ events: new Map(), addEventListener(name, callback) { this.events.set(name, callback); }, removeEventListener(name, callback) { if (this.events.get(name) === callback) this.events.delete(name); } }),
    head: { appendChild: script => scripts.push(script) } };
  const navigator = unsupported ? {} : { geolocation: { getCurrentPosition: (ok, fail, options) => gps.push({ ok, fail, options }) } };
  const api = { search: { query: body => { const d = deferred(); d.body = body; requests.push(d); return d.promise; } } };
  const router = { push: href => navigations.push(href), replace: href => navigations.push(href) };
  let source = readSource('apps/frontend/app/mobility/page.tsx').replace('export default function MobilityPage()', 'function MobilityPage()');
  source += `\nexport default ${source.includes('function MobilityContent(') ? 'MobilityContent' : 'MobilityPage'};`;
  const h = clientPage(source, {
    'next/link': { default: 'Link' }, 'next/navigation': { useRouter: () => router, useSearchParams: () => params },
    '../../lib/api-client': { api }, '../components/ui-primitives': primitives,
    '../components/platform-icon': { PlatformIcon: 'PlatformIcon' }, './mobility.module.css': { default: css }
  }, { window: runtime, document, navigator, URL, process: { env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: key ? 'fixture-only' : '' } }, setTimeout, clearTimeout });
  const inputs = () => h.all().filter(n => n.type === 'input');
  for (const input of inputs()) if (input.props.ref) input.props.ref.current = { value: '' };
  const edit = (index, value) => { inputs()[index].props.onChange({ target: { value } }); h.render(); };
  const locate = () => h.click(' استخدم موقعي');
  const position = (index = gps.length - 1, latitude = 33.5, longitude = 36.3) => { gps[index].ok({ coords: { latitude, longitude } }); h.render(); };
  return { h, runtime, document, navigator, maps, timers, requests, gps, geocodes, navigations, opens, handles, scripts, edit, inputs, locate, position,
    navigate(next) { params = new URLSearchParams(next); runtime.location.search = `?${params}`; h.render(); },
    initialize() { runtime.google = { maps }; runtime.initKhedmahMobility?.(); h.render(); },
    async resolve(index, name = 'مزود جديد') { requests[index].resolve({ businesses: name ? [{ id: 'provider/one', name, cityCode: 'damascus' }] : [] }); await h.flush(); },
    async reject(index) { requests[index].reject(new Error('offline')); await h.flush(); },
    select(type) { h.find(n => n.props['aria-pressed'] !== undefined && JSON.stringify(n.props.children).includes(type === 'taxi' ? 'تاكسي' : 'مندوب توصيل')).props.onClick(); h.render(); }
  };
}

for (const type of ['taxi','delivery']) {
  test(`${type}: explicit GPS and provider search use the selected category, never a booking API`, async () => {
    const f = fixture({ query: `type=${type}` }); assert.equal(f.gps.length, 0); assert.equal(f.requests.length, 0);
    f.locate(); f.position(); f.h.submit();
    assert.equal(f.requests[0].body.categoryCode, type === 'taxi' ? 'taxi' : 'delivery_courier');
    assert.equal(f.requests[0].body.latitude, 33.5); assert.equal(f.requests[0].body.longitude, 36.3);
    await f.resolve(0); assert.match(f.h.text, /مزود جديد/);
    assert.ok(f.h.find(n => n.props.href === '/business-profiles/provider%2Fone?source=mobility'));
  });
  test(`${type}: editing pickup invalidates an in-flight provider response`, async () => {
    const f = fixture({ query: `type=${type}` }); f.locate(); f.position(); f.h.submit(); f.edit(0, 'عنوان جديد');
    await f.resolve(0, 'مزود العنوان القديم'); assert.doesNotMatch(f.h.text, /مزود العنوان القديم/);
    assert.equal(f.inputs()[0].props.value, 'عنوان جديد');
  });
  test(`${type}: a failed provider query is not reported as a successful empty search`, async () => {
    const f = fixture({ query: `type=${type}` }); f.locate(); f.position(); f.h.submit(); await f.reject(0);
    assert.equal(f.h.find(n => n.type === 'EmptyState'), undefined);
    assert.ok(f.h.find(n => n.type === 'StatusMessage' && n.props.tone === 'danger'));
    f.h.click('إعادة البحث'); assert.equal(f.requests.length, 2); await f.resolve(1);
  });
  test(`${type}: a valid zero-result query keeps its category in the map recovery link`, async () => {
    const f = fixture({ query: `type=${type}` }); f.locate(); f.position(); f.h.submit(); await f.resolve(0, '');
    const link = f.h.find(n => n.type === 'ActionLink' && n.props.href?.startsWith('/map?'));
    assert.equal(new URLSearchParams(link.props.href.split('?')[1]).get('categoryCode'), type === 'taxi' ? 'taxi' : 'delivery_courier');
  });
}

test('switching taxi to courier invalidates the old response before the router commits', async () => {
  const f = fixture(); f.locate(); f.position(); f.h.submit(); f.select('delivery');
  assert.ok(f.navigations[0]?.includes('type=delivery')); await f.resolve(0, 'تاكسي قديم');
  assert.doesNotMatch(f.h.text, /تاكسي قديم/); f.navigate('type=delivery'); f.h.submit();
  assert.equal(f.requests[1].body.categoryCode, 'delivery_courier'); await f.resolve(1, 'مندوب جديد');
  assert.match(f.h.text, /مندوب جديد/);
});

test('Back/Forward and same-page URL changes restore the service type', () => {
  const f = fixture({ query:'type=delivery' }); f.navigate('type=taxi'); f.locate(); f.position(); f.h.submit();
  assert.equal(f.requests[0].body.categoryCode, 'taxi');
});

test('duplicate submit handlers before a render issue only one network request', () => {
  const f = fixture(); f.locate(); f.position(); const handler = f.h.find(n => n.props.as === 'form').props.onSubmit;
  handler({preventDefault(){}}); handler({preventDefault(){}}); assert.equal(f.requests.length, 1);
});

for (const outcome of ['success','failure']) test(`unmounted provider ${outcome} cannot write page state`, async () => {
  const f = fixture(); f.locate(); f.position(); f.h.submit(); f.h.unmount();
  if (outcome === 'success') await f.resolve(0); else await f.reject(0);
  assert.equal(f.h.writesAfterUnmount, 0);
});

for (const outcome of ['success','failure']) test(`unmounted GPS ${outcome} cannot write page state`, () => {
  const f = fixture(); f.locate(); f.h.unmount();
  if (outcome === 'success') f.gps[0].ok({coords:{latitude:33,longitude:36}}); else f.gps[0].fail({code:1});
  assert.equal(f.h.writesAfterUnmount, 0);
});

test('unsupported geolocation offers recovery without a thrown exception', () => {
  const f = fixture({ unsupported:true }); assert.doesNotThrow(f.locate); assert.match(f.h.text, /غير مدعوم/);
});

test('a geolocation policy exception does not leave the page busy', () => {
  const f = fixture(); f.navigator.geolocation.getCurrentPosition = () => { throw new Error('denied'); };
  assert.doesNotThrow(f.locate); assert.ok(f.h.find(n => n.props.onClick?.name === 'useCurrentLocation' && !n.props.disabled));
});

for (const coords of [[NaN,36],[91,36],[33,181],[Infinity,36]]) test(`invalid GPS ${coords} cannot issue a nearby query`, () => {
  const f = fixture(); f.locate(); f.position(0,...coords); f.h.submit(); assert.equal(f.requests.length,0);
});

test('an old GPS response cannot overwrite an address typed afterward', () => {
  const f = fixture(); f.locate(); f.edit(0,'اختيار يدوي جديد'); f.position();
  assert.equal(f.inputs()[0].props.value,'اختيار يدوي جديد'); f.h.submit(); assert.equal(f.requests.length,0);
});

test('an old reverse-geocode response cannot overwrite the new pickup', () => {
  const f = fixture({geocode:true}); f.locate(); f.position(); f.edit(0,'عنوان أحدث');
  f.geocodes[0].callback([{formatted_address:'عنوان قديم'}],'OK'); f.h.render();
  assert.equal(f.inputs()[0].props.value,'عنوان أحدث');
});

test('reverse-geocode failure preserves coordinates and does not abort provider discovery', async () => {
  const f = fixture({geocode:true}); f.locate(); f.position(); f.geocodes[0].callback(null,'ZERO_RESULTS'); f.h.render();
  assert.match(f.inputs()[0].props.value,/33\.500000/); f.h.submit(); await f.resolve(0); assert.match(f.h.text,/مزود جديد/);
});

test('a route is only opened explicitly with non-blank encoded endpoints', () => {
  const f=fixture(); f.edit(0,'   '); f.edit(1,'   '); f.h.click(' افتح المسار في Google'); assert.equal(f.opens.length,0);
  f.edit(0,'باب توما & شمال'); f.edit(1,'المزة'); f.h.click(' افتح المسار في Google');
  const [href,target,features]=f.opens[0]; assert.equal(new URL(href).searchParams.get('origin'),'باب توما & شمال');
  assert.equal(target,'_blank'); assert.match(features,/noopener/);
});

test('SDK initialization is idempotent and removes only its own listeners and callback', () => {
  const f=fixture({key:true}); f.initialize(); const initializer=f.runtime.initKhedmahMobility; initializer(); f.h.render();
  assert.equal(f.handles.length,2); const queued=[...f.handles[0].events.values()][0];
  const newer=()=>{}; f.runtime.initKhedmahMobility=newer; f.h.unmount(); queued();
  assert.equal(f.runtime.initKhedmahMobility,newer); assert.ok(f.handles.every(h=>h.events.size===0));
  assert.equal(f.h.writesAfterUnmount,0);
});

test('SDK error callbacks and initialization after unmount are harmless', () => {
  const f=fixture({key:true}); const initializer=f.runtime.initKhedmahMobility;
  const error=f.scripts[0].events.get('error') ?? f.scripts[0].onerror;
  f.h.unmount(); error(); initializer(); assert.equal(f.h.writesAfterUnmount,0);
});

test('silent SDK loading reaches a bounded failure with manual recovery', () => {
  const f=fixture({key:true}); assert.ok([...f.timers.values()].some(t=>t.ms>0 && t.ms<=20000));
  for (const t of f.timers.values()) t.callback(); f.h.render(); assert.match(f.h.text,/تحميل|اقتراحات/);
  f.h.unmount(); assert.equal(f.timers.size,0);
});
