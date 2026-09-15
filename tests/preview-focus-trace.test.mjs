import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installMainFocusTrace } from '../scripts/preview-focus-trace.mjs';

test('main focus tracing forwards the original call and event without restoring or suppressing focus', () => {
  const calls = [], listeners = new Map();
  class Element {
    constructor(main = false) { this.main = main; this.tagName = main ? 'MAIN' : 'INPUT'; }
    matches() { return this.main; }
    closest() { return null; }
    focus(...args) { calls.push({ target: this, args }); return 'native-result'; }
  }
  const input = new Element(), main = new Element(true);
  const document = { activeElement: input, addEventListener: (name, callback) => listeners.set(name, callback) };
  const window = {};
  const context = vm.createContext({ HTMLElement: Element, document, window, performance: { now: () => 10 }, URL,
    location: { origin: 'https://preview.example.test' },
    Error: class { stack = 'Error\n at trace\n at handler (https://preview.example.test/_next/static/chunks/app.js?token=secret#private:1:2)\n at provider (https://maps.googleapis.com/maps/api/js?key=secret:1:2)'; } });
  vm.runInContext(`(${installMainFocusTrace.toString()})()`, context);
  const options = { preventScroll: true };
  assert.equal(main.focus(options), 'native-result');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, main);
  assert.equal(calls[0].args[0], options);
  assert.equal(document.activeElement, input);
  listeners.get('focusin')({ target: main, relatedTarget: input });
  const trace = window.__khedmahReadMainFocusTrace();
  assert.equal(trace.length, 2);
  assert.equal(trace[0].fromTag, 'input');
  assert.equal(trace[1].kind, 'event');
  assert.equal(trace[0].callers[0].source, 'application:app.js');
  assert.equal(trace[0].callers[1].source, 'google-maps');
  assert.doesNotMatch(JSON.stringify(trace), /secret|token|private|https:/);
  input.focus();
  assert.equal(window.__khedmahReadMainFocusTrace().length, 2);
  for (let i = 0; i < 30; i += 1) main.focus();
  assert.equal(window.__khedmahReadMainFocusTrace().length, 20);
});
