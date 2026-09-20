import assert from 'node:assert/strict';
import test from 'node:test';
import { assessActionContrast, assessActionFocus, assessControlMotion } from '../scripts/classifieds-action-contrast.mjs';

const sample = (overrides = {}) => ({ visible: true, label: 'أضف إعلانًا', renderedOpacity: 1,
  unsupportedPaint: false, foregroundRgba: [20, 54, 83, 255], backgroundRgba: [253, 150, 3, 255], ...overrides });

test('reduced motion rejects the computed hover and press regressions even with zero transition duration', () => {
  for (const transform of ['none', 'matrix(1, 0, 0, 1, 0, 0)']) {
    assert.equal(assessControlMotion({ reducedMotion: true, transform }).status, 'passed');
  }
  for (const transform of ['matrix(1, 0, 0, 1, 0, -1)', 'matrix(1, 0, 0, 1, 0, 1)', 'matrix(1.1, 0, 0, 1.1, 0, 0)', undefined]) {
    assert.equal(assessControlMotion({ reducedMotion: true, transform, transitionDuration: '0s' }).failure, 'CONTROL_MOVES_WITH_REDUCED_MOTION');
  }
  assert.equal(assessControlMotion({ reducedMotion: false, transform: 'none' }).failure, 'REDUCED_MOTION_NOT_APPLIED');
});

test('computed action text accepts canonical navy on orange and rejects the original white regression', () => {
  assert.equal(assessActionContrast(sample()).status, 'passed');
  assert.equal(assessActionContrast(sample({ foregroundRgba: [255, 255, 255, 255] })).failure, 'ACTION_TEXT_CONTRAST_BELOW_4_5');
  assert.equal(assessActionContrast(sample({ foregroundRgba: [0, 0, 0, 255], backgroundRgba: [255, 255, 255, 255] })).ratio, 21);
});

test('contrast threshold is not rounded up to a pass', () => {
  assert.equal(assessActionContrast(sample({ foregroundRgba: [119, 119, 119, 255], backgroundRgba: [255, 255, 255, 255] })).status, 'failed');
  assert.equal(assessActionContrast(sample({ foregroundRgba: [118, 118, 118, 255], backgroundRgba: [255, 255, 255, 255] })).status, 'passed');
});

test('unmeasurable paint and missing visible text cannot create a contrast pass', () => {
  for (const override of [
    { visible: false }, { label: '' }, { unsupportedPaint: true }, { renderedOpacity: 0.55 },
    { foregroundRgba: [20, 54, 83, 128] }, { backgroundRgba: [253, 150, 3, 0] },
    { foregroundRgba: [NaN, 54, 83, 255] }, { backgroundRgba: null }
  ]) assert.equal(assessActionContrast(sample(override)).failure, 'ACTION_PAINT_NOT_MEASURABLE');
});

test('keyboard focus rejects orange on light surroundings and accepts semantic text in both themes', () => {
  const focus = sample({ focusVisible: true, outlineStyle: 'solid', outlineWidth: '3px',
    focusBackgroundReferences: [[248, 250, 249, 255], [255, 255, 255, 255]], outlineRgba: [253, 150, 3, 255] });
  assert.equal(assessActionFocus(focus).status, 'failed');
  assert.equal(assessActionFocus({ ...focus, outlineRgba: [20, 54, 83, 255] }).status, 'passed');
  assert.equal(assessActionFocus({ ...focus, outlineRgba: [240, 244, 242, 255],
    focusBackgroundReferences: [[16, 19, 21, 255], [28, 33, 36, 255]] }).status, 'passed');
  assert.equal(assessActionFocus({ ...focus, outlineRgba: [20, 54, 83, 255], focusVisible: false }).status, 'failed');
});
