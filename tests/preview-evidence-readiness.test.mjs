import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { main, assessEvidence, browserReadyForCapture, browserContentReadyForCapture, waitForCaptureReadiness, evidenceRoutes, evidenceViewports, evidenceThemes, validateBaseUrl } from '../scripts/capture-preview-evidence.mjs';

const ready = { theme: 'light', mapStatus: null, headerCount: 1, mainCount: 1, headingLength: 18, navigationCount: 5, navigationInteractiveCount: 5, navigationHrefs: ['/search', '/categories', '/map', '/mobility', '/classifieds'], authReady: true,
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
  ['clipped or covered navigation', { navigationInteractiveCount: 4 }, 'NAVIGATION_NOT_INTERACTIVE'],
  ['changed link destinations', { navigationHrefs: ['/search'] }, 'NAVIGATION_DESTINATIONS_CHANGED'],
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

test('evidence coverage is bounded to anonymous read-only routes at four screen sizes and both themes', () => {
  assert.deepEqual(evidenceRoutes.map(({ path }) => path), ['/', '/categories', '/search', '/map', '/professional-profiles/search']);
  assert.deepEqual(evidenceViewports.map(({ width }) => width), [1280, 390, 320, 768]);
  assert.deepEqual(evidenceThemes, ['light', 'dark']);
  assert.equal(evidenceRoutes[4].formName, 'بحث عن مهنيين');
});

// Orchestration tests use a browser double: they verify control flow and reporting,
// not page layout or real network readiness. Live captures remain the CI job's duty.
async function exerciseMain(t, overrides = {}, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const visits = [];
  let launches = 0;
  let contextFailures = options.contextFailures ?? 0;
  const browser = {
    version: () => 'test-double',
    close: async () => { if (options.closeFails) throw new Error('sensitive teardown details'); },
    newContext: async ({ colorScheme }) => {
      if (contextFailures-- > 0) throw new Error('context unavailable');
      let currentUrl;
      return {
        close: async () => undefined,
        newPage: async () => ({
          on: () => undefined,
          goto: async (url) => {
            currentUrl = url;
            visits.push(url);
            if (options.baselineFails && url.startsWith('https://staging.example.test')) throw new Error('navigation failed');
            return { status: () => 200 };
          },
          waitForFunction: async () => undefined,
          evaluate: async (fn) => fn === browserReadyForCapture ? true : ({ ...ready, theme: colorScheme }),
          url: () => currentUrl,
          screenshot: async () => undefined
        })
      };
    }
  };
  const env = { BEFORE_URL: 'https://staging.example.test', AFTER_URL: 'https://preview.example.test',
    PREVIEW_HEAD_SHA: 'test-head', GITHUB_SHA: 'test-merge', EVIDENCE_DIR: directory, ...overrides };
  const launchBrowser = async () => {
    launches += 1;
    if (options.launchFails) throw new Error('sensitive launch details');
    return browser;
  };
  const originalExitCode = process.exitCode;
  const report = await main(env, options.realLauncher ? {} : { launchBrowser });
  assert.equal(process.exitCode, originalExitCode, 'imported main must not modify the test process exit status');
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')), report);
  return { report, visits, launches, directory };
}

test('orchestration captures all forty Preview scenarios when BEFORE_URL is empty but fails comparison', async (t) => {
  const { report, visits } = await exerciseMain(t, { BEFORE_URL: '' });
  assert.equal(report.status, 'failed');
  assert.equal(report.previewStatus, 'passed');
  assert.equal(report.before.status, 'blocked');
  assert.deepEqual(report.before.failures, ['BEFORE_URL_MISSING']);
  assert.equal(report.after.length, 40);
  assert.equal(visits.length, 40);
  assert.ok(visits.every((url) => url.startsWith('https://preview.example.test/')));
  assert.equal(report.setupFailure, undefined);
});

test('orchestration rejects an unsafe baseline without exposing it or substituting the Preview', async (t) => {
  const { report, visits } = await exerciseMain(t, { BEFORE_URL: 'https://user:private-value@staging.example.test/?token=private-value' });
  assert.deepEqual(report.before.failures, ['BEFORE_URL_INVALID']);
  assert.equal(report.status, 'failed');
  assert.equal(report.previewStatus, 'passed');
  assert.equal(visits.length, 40);
  assert.ok(!JSON.stringify(report).includes('private-value'));
});

test('orchestration refuses using the same origin as before and after evidence', async (t) => {
  const { report, visits } = await exerciseMain(t, { BEFORE_URL: 'https://preview.example.test/' });
  assert.deepEqual(report.before.failures, ['BASELINE_EQUALS_PREVIEW']);
  assert.equal(report.status, 'failed');
  assert.equal(visits.length, 40);
});

test('orchestration accepts only a passing baseline AND forty passing Preview scenarios', async (t) => {
  const { report, visits } = await exerciseMain(t);
  assert.equal(report.status, 'passed');
  assert.equal(report.previewStatus, 'passed');
  assert.equal(report.before.status, 'passed');
  assert.equal(report.after.length, 40);
  assert.equal(visits.length, 41);
  assert.equal(report.headSha, 'test-head');
  assert.equal(report.checkoutSha, 'test-merge');
});

test('orchestration still captures Preview after a baseline navigation failure', async (t) => {
  const { report } = await exerciseMain(t, {}, { baselineFails: true });
  assert.equal(report.status, 'failed');
  assert.equal(report.before.status, 'failed');
  assert.equal(report.previewStatus, 'passed');
  assert.equal(report.after.length, 40);
});

for (const [value, code] of [[undefined, 'AFTER_URL_MISSING'], ['', 'AFTER_URL_MISSING'], ['not a URL', 'AFTER_URL_INVALID']]) {
  test(`orchestration does not start a browser for ${code} (${String(value)})`, async (t) => {
    const { report, launches } = await exerciseMain(t, { AFTER_URL: value });
    assert.equal(report.setupFailure, code);
    assert.equal(report.status, 'failed');
    assert.equal(report.previewStatus, 'not_run');
    assert.equal(launches, 0);
  });
}

test('orchestration reports a missing browser-tooling path explicitly', async (t) => {
  const { report } = await exerciseMain(t, {}, { realLauncher: true });
  assert.equal(report.setupFailure, 'BROWSER_TOOLING_PATH_MISSING');
  assert.equal(report.status, 'failed');
});

test('orchestration persists sanitized diagnostics when Chromium cannot launch', async (t) => {
  const { report } = await exerciseMain(t, {}, { launchFails: true });
  assert.equal(report.setupFailure, 'BROWSER_LAUNCH_FAILED');
  assert.equal(report.status, 'failed');
  assert.ok(!JSON.stringify(report).includes('sensitive'));
});

test('one failed Preview context does not discard sibling captures or later routes', async (t) => {
  const { report } = await exerciseMain(t, { BEFORE_URL: '' }, { contextFailures: 1 });
  assert.equal(report.status, 'failed');
  assert.equal(report.previewStatus, 'failed');
  assert.equal(report.after.length, 40);
  assert.equal(report.after.filter((item) => item.status === 'passed').length, 39);
  assert.deepEqual(report.after[0].failures, ['CAPTURE_SETUP_OR_CLEANUP_FAILED']);
});

test('browser teardown failure still writes the manifest and fails the gate', async (t) => {
  const { report } = await exerciseMain(t, {}, { closeFails: true });
  assert.equal(report.status, 'failed');
  assert.equal(report.setupFailure, 'BROWSER_CLOSE_FAILED');
  assert.equal(report.after.length, 40);
});

test('CLI exits nonzero and saves an actionable report on missing Preview configuration', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-evidence-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/capture-preview-evidence.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, BEFORE_URL: '', AFTER_URL: '', EVIDENCE_DIR: directory }, timeout: 10000
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(report.setupFailure, 'AFTER_URL_MISSING');
  assert.deepEqual(report.before.failures, ['BEFORE_URL_MISSING']);
});

test('review-evidence binds protected Preview variables while retaining least privilege and failure reporting', async () => {
  const workflow = await readFile(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  const reviewJob = workflow.split('  review-evidence:')[1].split('  cleanup-preview:')[0];
  assert.match(reviewJob, /^    environment: preview$/m);
  assert.match(reviewJob, /BEFORE_URL: \$\{\{ vars\.STAGING_FRONTEND_URL \}\}/);
  assert.match(reviewJob, /contents: read\s+pull-requests: write/);
  assert.doesNotMatch(reviewJob, /id-token: write|continue-on-error|\|\| true/);
  assert.match(reviewJob, /if: always\(\)/);
  assert.match(reviewJob, /evidence\.previewStatus/);
  assert.match(reviewJob, /evidence\.before\?\.failures/);
  assert.match(reviewJob, /evidence\.setupFailure/);
});


test('a failed baseline browser context cannot suppress all Preview diagnostics', async (t) => {
  const { report } = await exerciseMain(t, {}, { contextFailures: 1 });
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.before.failures, ['CAPTURE_SETUP_OR_CLEANUP_FAILED']);
  assert.equal(report.after.length, 40);
  assert.equal(report.previewStatus, 'passed');
});

// Exercise the actual browser-side readiness function against a deterministic DOM double.
// These tests complement, not replace, live Chromium captures.
async function readinessWithFonts({ fontStatus = 'loaded', afterFrame = () => undefined, busy = false } = {}) {
  const fonts = { status: fontStatus, ready: Promise.resolve() };
  let frames = 0;
  let layouts = 0;
  const document = {
    fonts,
    body: { getBoundingClientRect() { layouts += 1; return {}; } },
    querySelector(selector) {
      return selector.startsWith('main') ? { querySelector: () => ({ textContent: 'خدمة' }), hasAttribute: () => false } : {};
    },
    querySelectorAll() { return busy ? [{ getClientRects: () => [1] }] : []; }
  };
  const requestAnimationFrame = (done) => { frames += 1; afterFrame(fonts, frames); queueMicrotask(() => done(frames)); };
  const execute = new Function('document', 'requestAnimationFrame', `return (${browserReadyForCapture.toString()})();`);
  const result = await execute(document, requestAnimationFrame);
  return { result, frames, layouts };
}

test('capture readiness waits for layout and two rendering frames before accepting loaded fonts', async () => {
  assert.deepEqual(await readinessWithFonts(), { result: true, frames: 2, layouts: 1 });
});

test('capture readiness rejects a font load restarted during client rendering', async () => {
  const result = await readinessWithFonts({ afterFrame(fonts) { fonts.status = 'loading'; } });
  assert.equal(result.result, false);
  assert.equal(result.frames, 2);
});

test('capture readiness never accepts an unfinished font load or visible skeleton', async () => {
  assert.deepEqual(await readinessWithFonts({ fontStatus: 'loading' }), { result: false, frames: 0, layouts: 0 });
  assert.deepEqual(await readinessWithFonts({ busy: true }), { result: false, frames: 0, layouts: 0 });
});


test('the polling predicate is synchronous and never returns a truthy Promise for an unready page', () => {
  const execute = new Function('document', `return (${browserContentReadyForCapture.toString()})();`);
  const document = { querySelector: () => null, querySelectorAll: () => [], fonts: { status: 'loading' } };
  const result = execute(document);
  assert.equal(result, false);
  assert.equal(typeof result, 'boolean');
  assert.equal(browserContentReadyForCapture.constructor.name, 'Function');
});

test('capture awaits font-settling evaluation and repolls if rendering restarts loading', async () => {
  let polls = 0;
  let evaluations = 0;
  const page = {
    waitForFunction: async (fn, arg, options) => {
      assert.equal(fn, browserContentReadyForCapture);
      assert.equal(fn.constructor.name, 'Function');
      assert.equal(arg, null);
      assert.ok(options.timeout > 0 && options.timeout <= 30000);
      polls += 1;
    },
    evaluate: async (fn) => {
      assert.equal(fn, browserReadyForCapture);
      evaluations += 1;
      return evaluations === 2;
    }
  };
  await waitForCaptureReadiness(page);
  assert.equal(polls, 2);
  assert.equal(evaluations, 2);
});

test('capture does not evaluate or accept fonts before synchronous readiness resolves', async () => {
  let evaluated = false;
  const page = {
    waitForFunction: async () => { throw new Error('readiness timeout'); },
    evaluate: async () => { evaluated = true; return true; }
  };
  await assert.rejects(waitForCaptureReadiness(page), /readiness timeout/);
  assert.equal(evaluated, false);
});

test('capture readiness has a bounded deadline rather than an unlimited polling loop', async () => {
  let called = false;
  await assert.rejects(waitForCaptureReadiness({ waitForFunction() { called = true; } }, 0), /deadline exceeded/);
  assert.equal(called, false);
});


test('evidence rejects an unapplied theme and an unready map independently', () => {
  assert.deepEqual(assessEvidence({ ...ready, mapStatus: 'loading' }, 200, true, 0, 'dark'), ['THEME_NOT_APPLIED', 'MAP_NOT_READY']);
  assert.deepEqual(assessEvidence({ ...ready, theme: 'dark', mapStatus: 'ready' }, 200, true, 0, 'dark'), []);
});
test('every route, viewport and theme capture has a unique evidence filename', async (t) => {
  const { report } = await exerciseMain(t);
  assert.equal(new Set(report.after.map(item => item.screenshot)).size, 40);
  assert.equal(report.after.filter(item => item.theme === 'dark').length, 20);
});
