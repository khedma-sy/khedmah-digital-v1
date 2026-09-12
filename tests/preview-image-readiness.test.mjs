import assert from 'node:assert/strict';
import test from 'node:test';
import { assessEvidence, browserPrepareFullPageCapture } from '../scripts/capture-preview-evidence.mjs';

const ready = {
  theme: 'light',
  mapStatus: null,
  headerCount: 1,
  mainCount: 1,
  headingLength: 18,
  navigationCount: 7,
  navigationInteractiveCount: 7,
  navigationHrefs: ['/search', '/categories', '/food', '/map', '/taxi', '/store', '/classifieds'],
  authReady: true,
  busyCount: 0,
  alertCount: 0,
  imageCount: 3,
  incompleteImageCount: 0,
  fontStatus: 'loaded',
  overflowPx: 0,
  formNamed: true
};

test('evidence rejects rendered images that remain incomplete', () => {
  assert.deepEqual(assessEvidence(ready, 200, true), []);
  assert.ok(assessEvidence({ ...ready, incompleteImageCount: 1 }, 200, true).includes('IMAGES_NOT_READY'));
});

function renderedImage({ complete = true, naturalWidth = 640, naturalHeight = 360 } = {}) {
  return {
    currentSrc: '/brand/example.webp',
    complete,
    naturalWidth,
    naturalHeight,
    getAttribute: () => '/brand/example.webp',
    getClientRects: () => [{ width: 320, height: 180 }]
  };
}

async function executePreparation(images) {
  const scrolls = [];
  const windowObject = {
    scrollX: 0,
    scrollY: 0,
    innerHeight: 800,
    scrollTo(x, y) { scrolls.push([x, y]); }
  };
  const documentObject = {
    documentElement: { scrollHeight: 2200 },
    body: { scrollHeight: 2200 },
    querySelectorAll(selector) {
      assert.equal(selector, 'main#foundation-content img');
      return images;
    }
  };
  const getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  const requestAnimationFrame = (done) => queueMicrotask(done);
  const execute = new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'setTimeout',
    `return (${browserPrepareFullPageCapture.toString()})();`);
  const result = await execute(windowObject, documentObject, getComputedStyle, requestAnimationFrame, setTimeout);
  return { result, scrolls };
}

test('full-page preparation walks the document and restores the original scroll position', async () => {
  const { result, scrolls } = await executePreparation([renderedImage(), renderedImage()]);
  assert.deepEqual(result, { imageCount: 2, incompleteImageCount: 0 });
  assert.ok(scrolls.some(([, y]) => y >= 1600), 'capture preparation must reach below the initial viewport');
  assert.deepEqual(scrolls.at(-1), [0, 0]);
});

test('full-page preparation reports broken rendered images instead of producing a false-green screenshot', async () => {
  const { result } = await executePreparation([
    renderedImage(),
    renderedImage({ naturalWidth: 0, naturalHeight: 0 })
  ]);
  assert.deepEqual(result, { imageCount: 2, incompleteImageCount: 1 });
});