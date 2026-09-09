import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, primitives, readSource } from './helpers/client-page-harness.mjs';

// Execute the actual page with controlled Maps events. Live tiles and layout
// are checked separately by the preview capture; these are lifecycle tests.
function fixture() {
  const handles = [], timers = new Map(); let timerId = 0;
  const setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  const clearTimeout = (id) => timers.delete(id);
  class MapHandle {
    constructor() { this.events = new Map(); handles.push(this); }
    addListener(name, callback) {
      const callbacks = this.events.get(name) ?? new Set(); callbacks.add(callback); this.events.set(name, callbacks);
      return { remove: () => callbacks.delete(callback) };
    }
    emit(name) { for (const callback of this.events.get(name) ?? []) callback(); }
    getBounds() { return { toJSON: () => ({ south: 33, west: 36, north: 34, east: 37 }) }; }
    fitBounds() {}
  }
  const runtime = { setTimeout, clearTimeout, google: { maps: { Map: MapHandle } } };
  const context = { q: '', cityCode: '', categoryCode: '', invalidBounds: false };
  const source = readSource('apps/frontend/app/map/page.tsx').replace('export default function MarketplaceMapPage()', 'function MarketplaceMapPage()') + '\nexport default MapDiscovery;';
  const h = clientPage(source, {
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() },
    'next/link': 'Link',
    '../../lib/api-client': { api: { search: { query: async () => ({ businesses: [], total: 0 }) } } },
    '../../lib/map-context': { readMapContext: () => context, mapContextKey: () => 'context', mapHref: () => '/map', providerBounds: () => undefined, validMapBounds: () => true },
    '../../lib/search-context': { searchHref: () => '/search' },
    '../../lib/use-syrian-cities': { useSyrianCities: () => ({ cities: [], isLoading: false, error: '' }), canonicalCityCode: () => '', cityLabel: () => '' },
    '../../lib/use-categories': { useCategories: () => ({ categories: [], isLoading: false, error: '' }) },
    '../components/platform-icon': { PlatformIcon: 'PlatformIcon' },
    '../components/ui-primitives': primitives, '../discovery.module.css': { default: css }
  }, { window: runtime, document: {}, navigator: {}, setTimeout, clearTimeout, process: { env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'fixture-only' } } });
  const canvas = h.find(n => n.props.ref);
  assert.ok(canvas, 'actual map canvas ref exists'); canvas.props.ref.current = {};
  runtime.initKhedmahMap(); h.render();
  return {
    h, handles,
    get state() { return h.find(n => n.type === 'main').props['data-map-render-status']; },
    get runtimeState() { return h.find(n => n.type === 'main').props['data-map-status']; },
    get fallback() { return h.all().some(n => n.props.className === 'mapFallback'); },
    emit(name, handle = handles.at(-1)) { handle.emit(name); h.render(); },
    timeout() { for (const [id, timer] of [...timers]) if (timer.delay === 20000) { timers.delete(id); timer.fn(); } h.render(); },
    fail() { runtime.gm_authFailure(); h.render(); }
  };
}

test('map construction and idle cannot claim completed tile rendering', async () => {
  const f = fixture(); await f.h.flush();
  assert.equal(f.runtimeState, 'ready'); assert.equal(f.state, 'loading'); assert.equal(f.fallback, true);
  f.emit('idle'); assert.equal(f.state, 'loading');
  f.emit('tilesloaded'); assert.equal(f.state, 'ready'); assert.equal(f.fallback, false);
  f.h.unmount();
});

test('viewport changes invalidate rendering evidence without putting an overlay over an active pan', () => {
  const f = fixture(); f.emit('tilesloaded'); f.emit('idle');
  f.emit('bounds_changed'); assert.equal(f.state, 'loading'); assert.equal(f.fallback, false);
  f.emit('tilesloaded'); assert.equal(f.state, 'ready'); f.h.unmount();
});

test('initial tiles have a bounded timeout even when the Map object exists', () => {
  const f = fixture(); f.timeout();
  assert.equal(f.runtimeState, 'error'); assert.equal(f.state, 'error');
  assert.match(f.h.text, /وقتاً أطول من المتوقع/);
  assert.ok(f.h.find(n => n.type === 'ActionLink' && n.props.href === '/search'));
  f.h.unmount();
});

test('a successfully rendered map is not failed by its initial-load deadline', () => {
  const f = fixture(); f.emit('tilesloaded'); f.timeout();
  assert.equal(f.runtimeState, 'ready'); assert.equal(f.state, 'ready'); f.h.unmount();
});

test('a retry requires fresh tiles and ignores a queued callback from the discarded map', () => {
  const f = fixture(); const old = f.handles[0]; const late = [...old.events.get('tilesloaded')][0];
  f.emit('tilesloaded'); f.fail();
  const retry = f.h.find(n => n.type === 'ActionButton' && n.props.children?.some?.(v => typeof v === 'string' && v.includes('إعادة تشغيل الخريطة')));
  assert.ok(retry); retry.props.onClick(); f.h.render();
  assert.equal(f.handles.length, 2); assert.equal(f.state, 'loading');
  late(); f.h.render(); assert.equal(f.state, 'loading');
  assert.ok([...old.events.values()].every(callbacks => callbacks.size === 0));
  f.emit('tilesloaded'); assert.equal(f.state, 'ready'); f.h.unmount();
});

test('render events are removed on unmount and queued tile callbacks cannot write state', () => {
  const f = fixture(); const map = f.handles[0]; const late = [...map.events.get('tilesloaded')][0];
  f.h.unmount(); late();
  assert.equal(f.h.writesAfterUnmount, 0);
  assert.ok([...map.events.values()].every(callbacks => callbacks.size === 0));
});

test('effect replay cannot reuse the previous map rendering evidence', () => {
  const f = fixture(); f.emit('tilesloaded'); const old = f.handles[0];
  f.h.replay(); assert.equal(f.handles.length, 2); assert.equal(f.state, 'loading');
  assert.ok([...old.events.values()].every(callbacks => callbacks.size === 0));
  f.emit('tilesloaded'); assert.equal(f.state, 'ready'); f.h.unmount();
});

// These tests run the actual browser predicates, not just an invented manifest.
import { browserSnapshot, browserContentReadyForCapture, browserReadyForCapture } from '../scripts/capture-preview-evidence.mjs';

function browserFixture(options = {}) {
  const state = { runtime: 'ready', rendering: 'ready', width: 896, height: 740, visible: true, ...options };
  const surface = { getClientRects: () => state.visible ? [1] : [], getBoundingClientRect: () => ({ width: state.width, height: state.height }) };
  const main = {
    hasAttribute: name => name === 'data-map-status',
    getAttribute: name => name === 'data-map-status' ? state.runtime : name === 'data-map-render-status' ? state.rendering : null,
    querySelector: () => ({ textContent: 'الخدمات بالقرب منك' })
  };
  const document = {
    fonts: { status: 'loaded', ready: Promise.resolve() }, body: { getBoundingClientRect() {} },
    documentElement: { dataset: { theme: 'light' }, clientWidth: 1280, scrollWidth: 1280 },
    querySelector: selector => selector.startsWith('main') ? main : selector === '[data-map-surface]' ? (state.missing ? null : surface) : {},
    querySelectorAll: () => []
  };
  const getComputedStyle = () => ({ visibility: state.hidden ? 'hidden' : 'visible' });
  const run = (fn, afterFrame = () => {}) => new Function('document', 'getComputedStyle', 'requestAnimationFrame', `return (${fn.toString()})();`)(document, getComputedStyle, callback => { afterFrame(state); callback(); });
  return { state, run };
}

for (const [name, options, expected] of [
  ['loaded visible tiles', {}, true],
  ['runtime initialization without tile event', { rendering: 'loading' }, false],
  ['legacy ready flag without render evidence', { rendering: null }, false],
  ['failed runtime despite old tile evidence', { runtime: 'error' }, false],
  ['collapsed height', { height: 0 }, false],
  ['collapsed width', { width: 0 }, false],
  ['hidden map surface', { visible: false }, false],
  ['visibility hidden', { hidden: true }, false],
  ['missing map surface', { missing: true }, false]
]) {
  test(`capture map readiness: ${name}`, async () => {
    const f = browserFixture(options);
    assert.equal(f.run(browserContentReadyForCapture), expected);
    assert.equal(await f.run(browserReadyForCapture), expected);
    assert.equal(f.run(browserSnapshot).mapStatus === 'ready', expected);
  });
}

test('capture rechecks tile evidence after the two paint frames', async () => {
  const f = browserFixture();
  assert.equal(await f.run(browserReadyForCapture, state => { state.rendering = 'loading'; }), false);
});
