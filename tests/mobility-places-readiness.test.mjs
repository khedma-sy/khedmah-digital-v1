import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';

function fixture() {
  const handles = [], scripts = [], gps = [], requests = [], timers = new Map(); let id = 0;
  const runtime = { setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  class Autocomplete {
    constructor() { this.events = new Map(); handles.push(this); }
    addListener(name, fn) { this.events.set(name, fn); return { remove: () => this.events.delete(name) }; }
    unbindAll() { this.unbound = true; }
  }
  const maps = { places: { Autocomplete } };
  const document = { getElementById: id => scripts.find(s => s.id === id) ?? null,
    createElement: () => ({ events: new Map(), addEventListener(n, fn) { this.events.set(n, fn); }, removeEventListener(n, fn) { if (this.events.get(n) === fn) this.events.delete(n); } }),
    head: { appendChild: s => scripts.push(s) } };
  const source = readSource('apps/frontend/app/mobility/page.tsx').replace('export default function MobilityPage()', 'function MobilityPage()') + '\nexport default MobilityContent;';
  const h = clientPage(source, {
    'next/link': { default: 'Link' }, 'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams('type=delivery') },
    '../../lib/api-client': { api: { search: { query: value => { requests.push(value); return new Promise(() => {}); } } } },
    '../components/ui-primitives': primitives, '../components/platform-icon': { PlatformIcon: 'PlatformIcon' }, './mobility.module.css': { default: css }
  }, { window: runtime, document, navigator: { geolocation: { getCurrentPosition: ok => gps.push(ok) } }, URL, process: { env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'fixture-only' } } });
  h.all().filter(n => n.type === 'input').forEach(n => { if (n.props.ref) n.props.ref.current = { value: '' }; });
  return { h, runtime, maps, handles, scripts, timers, gps, requests,
    initialize() { runtime.google = { maps }; runtime.initKhedmahMobility(); h.render(); } };
}
const planner = f => f.h.find(node => node.props.as === 'form');
const state = f => f.h.find(node => node.type === 'div' && node.props['data-places-status'] !== undefined).props['data-places-status'];
const warning = f => f.h.find(node => node.type === 'StatusMessage' && node.props.tone === 'warning');

test('loading Places is explicitly busy, not a warning or a ready capture', () => {
  const f = fixture();
  assert.equal(state(f), 'loading');
  assert.equal(planner(f).props['aria-busy'], true); assert.equal(warning(f), undefined);
  f.scripts[0].events.get('load')(); f.h.render();
  assert.equal(planner(f).props['aria-busy'], true, 'script load alone is not SDK readiness');
  f.initialize();
  assert.equal(state(f), 'ready');
  assert.equal(planner(f).props['aria-busy'], false); assert.equal(f.timers.size, 0);
});
test('deadline is a terminal visible failure; late callbacks cannot create a false pass', () => {
  const f = fixture(); const late = f.runtime.initKhedmahMobility;
  for (const callback of [...f.timers.values()]) callback(); f.h.render();
  assert.equal(state(f), 'failed'); assert.ok(warning(f));
  f.runtime.google = { maps: f.maps }; late(); f.h.render();
  assert.equal(f.handles.length, 0); assert.equal(state(f), 'failed');
  assert.equal(planner(f).props['aria-busy'], false);
});
test('partially constructed Places widgets are disposed and cannot report ready', () => {
  const f = fixture(); const Original = f.maps.places.Autocomplete; let constructions = 0;
  f.maps.places.Autocomplete = class extends Original { constructor(node) { if (++constructions === 2) throw new Error('provider failure'); super(node); } };
  f.initialize(); assert.equal(f.handles.length, 1); assert.equal(f.handles[0].unbound, true);
  assert.equal(f.handles[0].events.size, 0); assert.equal(state(f), 'failed'); assert.ok(warning(f));
});
test('Google authorization failure revokes ready state and cannot be hidden by GPS', () => {
  const f = fixture(); f.initialize(); f.runtime.gm_authFailure(); f.h.render();
  assert.equal(state(f), 'failed'); assert.ok(warning(f));
  assert.ok(f.handles.every(handle => handle.unbound && handle.events.size === 0));
  f.h.click(' استخدم موقعي'); f.gps[0]({ coords: { latitude: 33.5, longitude: 36.3 } }); f.h.render();
  assert.ok(warning(f)); assert.match(f.h.text, /تعذر تحميل اقتراحات Google/); f.h.submit(); assert.equal(f.requests.length, 1);
});
test('disposed authorization callbacks do not clobber a newer route or write after unmount', () => {
  const f = fixture(); const old = f.runtime.gm_authFailure; const newer = () => {};
  f.runtime.gm_authFailure = newer; f.h.unmount(); old();
  assert.equal(f.runtime.gm_authFailure, newer); assert.equal(f.h.writesAfterUnmount, 0);
});
test('existing SDK can import Places once without inserting a duplicate script', async () => {
  const f = fixture(); const places = f.maps.places; delete f.maps.places;
  const library = deferred(); let imports = 0;
  f.maps.importLibrary = name => { assert.equal(name, 'places'); imports++; return library.promise; };
  f.initialize(); f.runtime.initKhedmahMobility(); assert.equal(imports, 1);
  f.maps.places = places; library.resolve(places); await f.h.flush();
  assert.equal(f.scripts.length, 1); assert.equal(f.handles.length, 2); assert.equal(state(f), 'ready');
});
