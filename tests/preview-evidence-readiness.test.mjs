import assert from 'node:assert/strict';
import test from 'node:test';
import { assessEvidence, evidenceRoutes, evidenceViewports, validateBaseUrl } from '../scripts/capture-preview-evidence.mjs';

const ready = { headerCount: 1, mainCount: 1, headingLength: 18, navigationCount: 5, authReady: true,
  busyCount: 0, alertCount: 0, fontStatus: 'loaded', overflowPx: 0, formNamed: true };

test('evidence accepts a ready 2xx page but does not equate an image file with readiness', () => {
  assert.deepEqual(assessEvidence(ready, 200, true), []);
  assert.ok(assessEvidence({}, 200, true).includes('CONTENT_NOT_READY'));
});

for (const [name, change, code] of [
  ['blank baseline', { mainCount: 0, headingLength: 0 }, 'CONTENT_NOT_READY'],
  ['missing header', { headerCount: 0 }, 'HEADER_MISSING_OR_DUPLICATED'],
  ['duplicated header', { headerCount: 2 }, 'HEADER_MISSING_OR_DUPLICATED'],
  ['unresolved navigation', { authReady: false }, 'NAVIGATION_NOT_READY'],
  ['missing discovery links', { navigationCount: 4 }, 'NAVIGATION_NOT_READY'],
  ['unfinished skeleton', { busyCount: 1 }, 'LOADING_NOT_FINISHED'],
  ['visible error', { alertCount: 1 }, 'VISIBLE_ERROR_OR_WARNING'],
  ['unloaded font', { fontStatus: 'loading' }, 'FONTS_NOT_READY'],
  ['mobile overflow', { overflowPx: 12 }, 'HORIZONTAL_OVERFLOW'],
  ['dropped form name', { formNamed: false }, 'FORM_NAME_MISSING']
]) {
  test(`evidence rejects ${name}`, () => {
    assert.ok(assessEvidence({ ...ready, ...change }, 200, true).includes(code));
  });
}

test('evidence rejects HTTP errors, redirects and browser exceptions independently', () => {
  assert.deepEqual(assessEvidence(ready, 503, false, 1), ['HTTP_NOT_SUCCESS', 'UNEXPECTED_REDIRECT', 'BROWSER_RUNTIME_ERROR']);
});

test('evidence origins reject insecure URLs, embedded credentials and query values', () => {
  assert.equal(validateBaseUrl('https://preview.example.test/'), 'https://preview.example.test');
  for (const url of ['http://preview.example.test', 'https://name:password@example.test', 'https://example.test/path', 'https://example.test/?token=value', 'https://example.test/#fragment', '']) {
    assert.throws(() => validateBaseUrl(url));
  }
});

test('evidence coverage is bounded to anonymous read-only routes at two screen sizes', () => {
  assert.deepEqual(evidenceRoutes.map(({ path }) => path), ['/', '/categories', '/professional-profiles/search']);
  assert.deepEqual(evidenceViewports.map(({ width }) => width), [1280, 390]);
  assert.equal(evidenceRoutes[2].formName, 'بحث عن مهنيين');
});
