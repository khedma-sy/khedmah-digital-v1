import test from 'node:test';
import assert from 'node:assert/strict';
import { browserControlReachability, controlReachabilityFailure, lastApplicationControl } from '../scripts/check-preview-interactions.mjs';

async function scenario({ movingUntil = 0, overlay = false, focus = true }) {
  const originals = Object.fromEntries(['document', 'performance', 'requestAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let now = 0;
  const element = { tagName: 'A', isConnected: true, closest: () => null, contains: target => target === element,
    getBoundingClientRect: () => ({ left: 16, top: now < movingUntil ? now : 400, width: 288, height: 48 }) };
  try {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: callback => { now += 16; callback(now); } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      activeElement: focus ? element : null,
      hasFocus: () => true,
      elementFromPoint: () => overlay ? { tagName: 'HEADER' } : element
    } });
    return await browserControlReachability(element);
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test('control reachability waits for focused hit geometry to settle', async () => {
  const result = await scenario({ movingUntil: 160 });
  assert.equal(result.reachable, true);
  assert.equal(result.bounds.top, 400);
  assert.equal(result.stableFrames, 3);
});

test('a persistent overlay remains a failure and records the blocking element', async () => {
  const result = await scenario({ overlay: true });
  assert.equal(result.reachable, false);
  assert.equal(result.hitTag, 'header');
  assert.equal(result.focused, true);
  assert.equal(result.hitMatches, false);
});

test('moving or unfocused controls cannot pass the bounded reachability check', async () => {
  assert.equal(controlReachabilityFailure(await scenario({ movingUntil: 3000 })), 'MAIN_CONTROL_UNSTABLE');
  const unfocused = await scenario({ focus: false });
  assert.equal(unfocused.reachable, false);
  assert.equal(unfocused.hitMatches, true);
  assert.equal(controlReachabilityFailure(unfocused), 'MAIN_CONTROL_FOCUS_LOST');
});

test('failure diagnostics distinguish focus, detachment and occlusion without granting a pass', async () => {
  assert.equal(controlReachabilityFailure(await scenario({ overlay: true })), 'MAIN_CONTROL_OBSCURED');
  assert.equal(controlReachabilityFailure(await scenario({})), null);
  assert.equal(controlReachabilityFailure({ reachable: false, connected: false }), 'MAIN_CONTROL_DETACHED');
  assert.equal(controlReachabilityFailure({ reachable: false, connected: true, documentFocused: false }), 'BROWSER_DOCUMENT_NOT_FOCUSED');
});

test('provider insertion cannot replace the application node after its ownership check', async () => {
  const provider = { name: 'Google control', closest: () => ({}) };
  const items = [];
  const application = { name: 'Khedmah signup', closest: () => {
    items.unshift(provider);
    return null;
  } };
  items.push(application, provider);
  const handle = node => ({ evaluate: async callback => callback(node) });
  const page = { locator: () => ({ count: async () => items.length, nth: index => ({
    evaluate: async callback => callback(items[index]),
    elementHandle: async () => handle(items[index])
  }) }) };
  const selected = await lastApplicationControl(page);
  assert.equal(await selected.evaluate(node => node.name), 'Khedmah signup');
});
