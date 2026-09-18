import test from 'node:test';
import assert from 'node:assert/strict';
import { assessInlineLayout } from '../scripts/sixth-audit-layout.mjs';

const bounded = () => ({ viewportWidth: 320, mainOverflowPx: 0,
  elements: [{ tag: 'h1', left: 16, right: 304, width: 288 }] });

test('accepts bounded RTL content including subpixel rounding', () => {
  assert.equal(assessInlineLayout(bounded()).status, 'passed');
  assert.equal(assessInlineLayout({ ...bounded(),
    elements: [{ left: -0.5, right: 320.5, width: 321 }] }).status, 'passed');
});

test('rejects clipping hidden from document overflow in either direction', () => {
  for (const element of [{ left: 49, right: 337, width: 288 }, { left: -33, right: 287, width: 320 }]) {
    assert.deepEqual(assessInlineLayout({ ...bounded(), elements: [element] }).failures,
      ['CRITICAL_ELEMENT_CLIPPED_INLINE']);
  }
});

test('rejects hidden PageShell overflow before focus shifts its contents', () => {
  assert.deepEqual(assessInlineLayout({ ...bounded(), mainOverflowPx: 33 }).failures,
    ['MAIN_INLINE_OVERFLOW']);
});

test('fails closed on absent or unmeasurable geometry', () => {
  for (const patch of [{ viewportWidth: 0 }, { mainOverflowPx: null }, { elements: [] },
    { elements: [{ left: 0, right: NaN, width: 288 }] }]) {
    assert.equal(assessInlineLayout({ ...bounded(), ...patch }).status, 'failed');
  }
});
