import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../apps/frontend/lib/use-syrian-cities.ts', import.meta.url), 'utf8');
const cities = [{ code: 'aleppo', countryCode: 'SY', nameAr: 'حلب' }];
// Execute the actual hook with controlled requests and effect cleanup, not a browser mockup.
function fixture() {
  const slots = [], effects = new Map(), calls = [];
  let cursor, dirty, output, mounted = true, writesAfterUnmount = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++, slot = slots[i] ??= { value: initial };
      return [slot.value, (next) => {
        if (!mounted) { writesAfterUnmount++; return; }
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: callback, deps };
      return slots[i].value;
    },
    useEffect(setup, deps) {
      const i = cursor++, slot = slots[i] ??= {};
      if (!same(slot.deps, deps)) { slot.deps = deps; slot.setup = setup; effects.set(i, setup); }
    }
  };
  const api = { locations: { cities() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    calls.push({ resolve, reject }); return promise;
  } } };
  const exports = {};
  new Script(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)
    .runInContext(createContext({ exports, require(id) {
      if (id === 'react') return hooks;
      if (id === './api-client') return { api };
      throw new Error(`Unexpected dependency: ${id}`);
    } }));
  function render() {
    let rounds = 0;
    do {
      cursor = 0; dirty = false; output = exports.useSyrianCities();
      const pending = [...effects]; effects.clear();
      for (const [i] of pending) slots[i].cleanup?.();
      for (const [i, setup] of pending) slots[i].cleanup = setup();
      assert.ok(++rounds < 20);
    } while (dirty);
  }
  render();
  return { calls, get state() { return output; }, get writesAfterUnmount() { return writesAfterUnmount; },
    retry() { void output.retry(); render(); },
    replay() { for (const s of slots) if (s.setup) s.cleanup?.(); for (const s of slots) if (s.setup) s.cleanup = s.setup(); render(); },
    unmount() { for (const s of slots) s.cleanup?.(); mounted = false; },
    async flush() { await new Promise(setImmediate); if (mounted) render(); }
  };
}

test('cities retain Syrian registry entries only', async () => {
  const f = fixture(); f.calls[0].resolve({ cities: [...cities, { code: 'other', countryCode: 'XX' }] }); await f.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.cities)), cities); assert.equal(f.state.isLoading, false);
});
for (const outcome of ['resolve', 'reject']) test(`superseded city ${outcome} cannot stop loading or replace a newer registry`, async () => {
  const f = fixture(); f.retry();
  outcome === 'resolve' ? f.calls[0].resolve({ cities: [] }) : f.calls[0].reject(new Error('old'));
  await f.flush(); assert.equal(f.state.isLoading, true); assert.equal(f.state.error, '');
  f.calls[1].resolve({ cities }); await f.flush(); assert.equal(f.state.cities[0].code, 'aleppo');
});
test('refresh failure retains known city labels, exposes error and retries', async () => {
  const f = fixture(); f.calls[0].resolve({ cities }); await f.flush(); f.retry();
  f.calls[1].reject(new Error('offline')); await f.flush();
  assert.equal(f.state.cities[0].code, 'aleppo'); assert.ok(f.state.error); assert.equal(f.state.isLoading, false);
  f.retry(); assert.equal(f.state.error, ''); f.calls[2].resolve({ cities }); await f.flush(); assert.equal(f.state.isLoading, false);
});
for (const outcome of ['resolve', 'reject']) test(`city ${outcome} after unmount never writes state`, async () => {
  const f = fixture(); f.unmount();
  outcome === 'resolve' ? f.calls[0].resolve({ cities }) : f.calls[0].reject(new Error('late'));
  await f.flush(); assert.equal(f.writesAfterUnmount, 0);
});
test('effect replay ignores the discarded city response after the current one settles', async () => {
  const f = fixture(); f.replay(); f.calls[1].resolve({ cities }); await f.flush();
  f.calls[0].resolve({ cities: [] }); await f.flush(); assert.equal(f.state.cities[0].code, 'aleppo');
});
