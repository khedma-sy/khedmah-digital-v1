import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { main, captureLimits, sixthAuditRoutes } from '../scripts/capture-sixth-audit-evidence.mjs';
import { browserPrepareFullPageCapture, browserReadyForCapture, browserSnapshot, evidenceThemes, evidenceViewports } from '../scripts/capture-preview-evidence.mjs';
import { browserAuthShell, browserDesignLayout } from '../scripts/page-design-evidence.mjs';
import { browserInlineLayout } from '../scripts/sixth-audit-layout.mjs';
import { browserActionPaint } from '../scripts/classifieds-action-contrast.mjs';

const manifestName = 'sixth-audit-visual-manifest.json';
const keepDefault = Symbol('default operation');
const navigationHrefs = ['/search', '/categories', '/food', '/mobility?type=delivery', '/map', '/taxi', '/store', '/classifieds'];

function controlledClock() {
  let time = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    pending: () => timers.size,
    advance: (duration, fireTimers = true) => {
      time += duration;
      if (fireTimers) for (const [id, timer] of timers) {
        if (timer.at <= time) { timers.delete(id); timer.callback(); }
      }
    }
  };
}

async function exercise(t, intercept = () => keepDefault) {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-sixth-deadline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const clock = controlledClock();
  const visits = [];
  const configurations = [];
  const eventHandlers = [];
  const calls = [];
  const checkpoint = () => JSON.parse(readFileSync(join(directory, manifestName), 'utf8'));
  const operation = (phase, index, fallback, details = {}) => {
    calls.push({ phase, index });
    const result = intercept({ phase, index, clock, directory, checkpoint, ...details });
    return result === keepDefault ? fallback() : result;
  };
  const browser = {
    close: () => operation('browser_close', 0, () => undefined),
    newContext: (configuration) => {
      const index = configurations.push(configuration);
      let currentUrl;
      const paint = { label: 'fixture', visible: true, unsupportedPaint: false, renderedOpacity: 1,
        reducedMotion: true, transform: 'none', foregroundRgba: [255,255,255,255], backgroundRgba: [7,66,124,255],
        focusVisible: true, outlineWidth: '2px', outlineStyle: 'solid', outlineRgba: [0,0,0,255],
        focusBackgroundReferences: [[255,255,255,255], [255,255,255,255]] };
      const page = {
        on: (event, handler) => { if (event === 'pageerror') eventHandlers[index] = handler; },
        goto: (url) => operation('navigation', index, () => { currentUrl = url; visits.push(url); return { status: () => 200 }; }),
        url: () => currentUrl,
        waitForFunction: async () => undefined,
        mouse: { move: async () => undefined },
        keyboard: { press: async () => undefined },
        locator: () => ({ count: async () => 1, nth: () => ({
          isEnabled: async () => true, hover: async () => undefined, focus: async () => undefined,
          evaluate: (fn) => fn === browserActionPaint ? operation('paint', index, () => ({ ...paint })) : undefined
        }) }),
        evaluate: (fn, key) => {
          if (fn === browserReadyForCapture) return operation('readiness', index, () => true);
          if (fn === browserPrepareFullPageCapture) return operation('full_page_prepare', index, () => ({ imageCount: 1, incompleteImageCount: 0 }));
          if (fn === browserSnapshot) return operation('snapshot', index, () => ({
            theme: configuration.colorScheme, headerCount: 1, mainCount: 1, headingLength: 18,
            navigationCount: currentUrl.includes('/auth/') ? 0 : navigationHrefs.length,
            navigationInteractiveCount: navigationHrefs.length, navigationHrefs, authReady: true,
            busyCount: 0, alertCount: 0, incompleteImageCount: 0, fontStatus: 'loaded', overflowPx: 0, formNamed: true
          }), { emitError: eventHandlers[index] });
          if (fn === browserAuthShell) return operation('auth_shell', index, () => ({
            headerHeight: 0, headerBrandCount: 0, assistantCount: 1, brandCount: 1, tabCount: 2, currentTabCount: 1, switchHrefValid: true
          }));
          if (fn === browserDesignLayout) return operation('page_design', index, () => ({
            key, htmlDir: 'rtl', direction: 'rtl', missingTokens: [],
            samples: Array.from({ length: 2 }, () => ({ padding: 16, minimumPadding: 16, gap: 16, minimumGap: 16 })),
            signup: { loginHref: '/auth/login?next=%2Ftaxi-driver-signup', formCount: 0, stepCount: 6 }
          }));
          if (fn === browserInlineLayout) return operation('inline_layout', index, () => ({
            viewportWidth: configuration.viewport.width, mainOverflowPx: 0, elements: [{ left: 16, right: 304, width: 288 }]
          }));
          if (fn.name === 'directionSnapshot') return operation('direction', index, () => ({ htmlDir: 'rtl', bodyDirection: 'rtl' }));
          return undefined;
        },
        screenshot: (options) => operation('screenshot', index, () => Buffer.from('isolated screenshot fixture'), { options })
      };
      const context = {
        newPage: () => operation('page_create', index, () => page),
        close: () => operation('context_close', index, () => undefined)
      };
      return operation('context_create', index, () => context);
    }
  };
  const previousExitCode = process.exitCode;
  const report = await main({ AFTER_URL: 'https://preview.example.test', EVIDENCE_DIR: directory }, {
    launch: () => operation('browser_launch', 0, () => browser), clock, log: () => {}
  });
  assert.equal(process.exitCode, previousExitCode, 'imported main cannot terminate or change its host exit status');
  assert.equal(clock.pending(), 0, 'all owned deadline timers must be retired on return');
  assert.deepEqual(checkpoint(), report);
  return { report, directory, visits, configurations, calls, clock, checkpoint, eventHandlers };
}

function pendingPastDeadline(clock, duration, captureResolve = () => {}) {
  const pending = new Promise(captureResolve);
  queueMicrotask(() => clock.advance(duration));
  return pending;
}

test('normal capture retains all 72 ordered routes/viewports/themes and real assessment helpers', async (t) => {
  const result = await exercise(t, ({ phase, checkpoint, options }) => {
    if (phase === 'browser_close') assert.equal(checkpoint().status, 'failed', 'cleanup is part of aggregate success');
    if (phase === 'screenshot') assert.equal(options.path, undefined, 'abandoned capture must not own a file path');
    return keepDefault;
  });
  const expected = sixthAuditRoutes.flatMap((route) => evidenceViewports.flatMap((viewport) => evidenceThemes.map((theme) => ({
    href: route.href, viewport: { width: viewport.width, height: viewport.height }, theme
  }))));
  assert.equal(result.report.status, 'passed');
  assert.equal(result.report.expectedScenarios, 72);
  assert.deepEqual(result.report.limits, captureLimits);
  assert.equal(result.report.scenarios.length, 72);
  assert.ok(result.report.scenarios.every((row) => row.completed && row.status === 'passed' && row.screenshot));
  assert.deepEqual(result.visits.map((url) => new URL(url).pathname + new URL(url).search), expected.map(({ href }) => href));
  assert.deepEqual(result.configurations, expected.map(({ viewport, theme }) => ({ viewport, locale: 'ar-SY', colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 })));
  assert.equal(result.calls.filter(({ phase }) => phase === 'auth_shell').length, 16);
  assert.equal(result.calls.filter(({ phase }) => phase === 'inline_layout').length, 72);
  assert.equal((await readdir(result.directory)).filter((name) => name.endsWith('.png')).length, 72);
});

test('a fifth unresolved evaluation fails at its deadline and late settlement cannot rewrite evidence', async (t) => {
  let finishLate;
  const result = await exercise(t, ({ phase, index, clock, checkpoint }) => {
    if (index === 5 && phase === 'full_page_prepare') {
      const progress = checkpoint();
      assert.equal(progress.status, 'failed');
      assert.equal(progress.progress.phase, 'full_page_prepare');
      assert.equal(progress.progress.scenario, 5);
      assert.equal(progress.scenarios.length, 72);
      assert.equal(progress.scenarios.filter(({ status }) => status === 'passed').length, 4);
      return pendingPastDeadline(clock, captureLimits.scenarioMs + 1, (resolve) => { finishLate = resolve; });
    }
    return keepDefault;
  });
  const record = result.report.scenarios[4];
  assert.equal(result.report.status, 'failed');
  assert.equal(result.report.scenarios.filter(({ status }) => status === 'passed').length, 71);
  assert.ok(record.failures.includes('SIXTH_AUDIT_SCENARIO_DEADLINE_EXCEEDED'));
  assert.equal(record.failedPhase, 'full_page_prepare');
  assert.equal(record.imageReadiness, undefined);
  const finalManifest = await readFile(join(result.directory, manifestName), 'utf8');
  finishLate({ imageCount: 99, incompleteImageCount: 0 });
  result.eventHandlers[5]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(record.imageReadiness, undefined);
  assert.equal(record.pageErrorCount, 0);
  assert.equal(await readFile(join(result.directory, manifestName), 'utf8'), finalManifest);
  assert.deepEqual(result.checkpoint(), result.report);
});

test('elapsed wall clock rejects a fulfilled operation even before its timeout callback runs', async (t) => {
  const result = await exercise(t, ({ phase, index, clock }) => {
    if (index === 5 && phase === 'full_page_prepare') {
      clock.advance(captureLimits.scenarioMs + 1, false);
      return { imageCount: 99, incompleteImageCount: 0 };
    }
    return keepDefault;
  });
  assert.equal(result.report.status, 'failed');
  assert.equal(result.report.scenarios[4].imageReadiness, undefined);
  assert.ok(result.report.scenarios[4].failures.includes('SIXTH_AUDIT_SCENARIO_DEADLINE_EXCEEDED'));
});

test('late screenshot bytes cannot create an evidence file or turn failure into success', async (t) => {
  let finishLate;
  const result = await exercise(t, ({ phase, index, clock }) => index === 5 && phase === 'screenshot'
    ? pendingPastDeadline(clock, captureLimits.screenshotMs + 1, (resolve) => { finishLate = resolve; }) : keepDefault);
  assert.equal(result.report.status, 'failed');
  assert.ok(result.report.scenarios[4].failures.includes('SCREENSHOT_UNAVAILABLE'));
  assert.equal(result.report.scenarios[4].screenshot, undefined);
  const files = await readdir(result.directory);
  const manifest = await readFile(join(result.directory, manifestName), 'utf8');
  finishLate(Buffer.from('late screenshot bytes'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await readdir(result.directory), files);
  assert.equal(await readFile(join(result.directory, manifestName), 'utf8'), manifest);
});

test('stalled fourth context cleanup aborts safely with all 72 obligations still recorded', async (t) => {
  const result = await exercise(t, ({ phase, index, clock, checkpoint }) => {
    if (index === 4 && phase === 'context_close') {
      assert.equal(checkpoint().progress.phase, 'context_close');
      return pendingPastDeadline(clock, captureLimits.cleanupMs + 1);
    }
    return keepDefault;
  });
  assert.equal(result.report.status, 'failed');
  assert.equal(result.visits.length, 4);
  assert.equal(result.report.scenarios.length, 72);
  assert.ok(result.report.scenarios[3].failures.includes('CONTEXT_CLOSE_FAILED'));
  assert.ok(result.report.scenarios.slice(4).every((row) => !row.completed && row.status === 'failed' && row.failures.includes('SIXTH_AUDIT_CAPTURE_ABORTED')));
  assert.equal(result.calls.filter(({ phase }) => phase === 'browser_close').length, 1);
});

test('stalled browser cleanup cannot accept even 72 successful captures', async (t) => {
  const result = await exercise(t, ({ phase, clock, checkpoint }) => {
    if (phase === 'browser_close') {
      assert.equal(checkpoint().status, 'failed');
      assert.equal(checkpoint().scenarios.filter(({ status }) => status === 'passed').length, 72);
      return pendingPastDeadline(clock, captureLimits.cleanupMs + 1);
    }
    return keepDefault;
  });
  assert.equal(result.report.status, 'failed');
  assert.equal(result.report.setupFailure, 'BROWSER_CLOSE_FAILED');
  assert.equal(result.report.failedPhase, 'browser_close');
  assert.equal(result.report.cleanupIncomplete, true);
});

test('launch deadline rejects a late browser without changing finalized state', async (t) => {
  let finishLate;
  const result = await exercise(t, ({ phase, clock }) => {
    if (phase === 'browser_launch') return pendingPastDeadline(clock, captureLimits.launchMs + 1, (resolve) => { finishLate = resolve; });
    return keepDefault;
  });
  assert.equal(result.report.status, 'failed');
  assert.equal(result.report.scenarios.length, 72);
  assert.ok(result.report.scenarios.every((row) => !row.completed && row.status === 'failed'));
  assert.equal(result.report.cleanupIncomplete, true);
  assert.equal(result.report.failedPhase, 'browser_launch');
  const manifest = await readFile(join(result.directory, manifestName), 'utf8');
  let disposed = false;
  finishLate({ close: async () => { disposed = true; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposed, true);
  assert.equal(await readFile(join(result.directory, manifestName), 'utf8'), manifest);
});

test('real visual assessment failures remain failed under the bounded runner', async (t) => {
  const result = await exercise(t, ({ phase, index, emitError }) => {
    if (phase === 'direction' && index === 1) return { htmlDir: 'ltr', bodyDirection: 'rtl' };
    if (phase === 'snapshot' && index === 2) emitError();
    if (phase === 'inline_layout' && index === 3) return { viewportWidth: 390, mainOverflowPx: 2, elements: [{ left: 0, right: 400, width: 400 }] };
    if (phase === 'auth_shell' && index === 57) return { headerHeight: 0, headerBrandCount: 0, assistantCount: 0, brandCount: 1, tabCount: 2, currentTabCount: 1, switchHrefValid: true };
    if (phase === 'paint' && [17,18,19].includes(index)) return {
      label: 'fixture', visible: true, unsupportedPaint: false, renderedOpacity: 1,
      foregroundRgba: [255,255,255,255], backgroundRgba: index === 17 ? [255,255,255,255] : [7,66,124,255],
      reducedMotion: true, transform: index === 18 ? 'matrix(1,0,0,1,0,-1)' : 'none',
      focusVisible: index !== 19, outlineWidth: '2px', outlineStyle: 'solid', outlineRgba: [0,0,0,255],
      focusBackgroundReferences: [[255,255,255,255], [255,255,255,255]]
    };
    return keepDefault;
  });
  for (const [index, code] of [[1,'RTL_NOT_APPLIED'],[2,'BROWSER_RUNTIME_ERROR'],[3,'MAIN_INLINE_OVERFLOW'],
    [17,'ACTION_TEXT_CONTRAST_BELOW_4_5'],[18,'CONTROL_MOVES_WITH_REDUCED_MOTION'],[19,'ACTION_FOCUS_CONTRAST_UNVERIFIED'],[57,'AUTH_SHELL_NOT_READY']]) {
    assert.equal(result.report.scenarios[index - 1].status, 'failed');
    assert.ok(result.report.scenarios[index - 1].failures.includes(code), code);
  }
});

for (const mode of ['browser_close', 'global_watchdog']) {
  test(`CLI ${mode} exits nonzero and preserves a failed manifest despite live process handles`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'khedmah-sixth-cli-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const packagePath = join(directory, 'node_modules/playwright');
    await mkdir(packagePath, { recursive: true });
    await writeFile(join(directory, 'package.json'), '{}');
    // An isolated process double models the lifecycle ownership documented by
    // pinned Playwright 1.55.0; this test does not claim real Chromium rendering.
    await writeFile(join(packagePath, 'index.js'), `
      const { spawn } = require('node:child_process');
      const { writeFileSync } = require('node:fs');
      exports.chromium = { launch: async () => {
        const owned = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        writeFileSync(process.env.EVIDENCE_DIR + '/owned.pid', String(owned.pid));
        process.on('exit', () => owned.kill('SIGKILL'));
        ${mode === 'global_watchdog' ? 'return new Promise(() => {});' : `return {
          newContext: async () => { throw new Error('isolated context unavailable'); },
          close: () => new Promise(() => {})
        };`}
      }};
    `);
    const preload = join(directory, 'clock.mjs');
    await writeFile(preload, `
      const realTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (callback, delay, ...args) => realTimeout(callback,
        delay === 480000 ? ${mode === 'global_watchdog' ? 40 : 3000} : delay > 4000 && delay <= 5000 ? 10 : delay, ...args);
    `);
    const child = spawnSync(process.execPath, ['--import', preload, fileURLToPath(new URL('../scripts/capture-sixth-audit-evidence.mjs', import.meta.url))], {
      env: { ...process.env, AFTER_URL: 'https://preview.example.test', EVIDENCE_DIR: directory, PLAYWRIGHT_PACKAGE_JSON: join(directory, 'package.json') },
      timeout: 5000, encoding: 'utf8'
    });
    const ownedPid = Number(await readFile(join(directory, 'owned.pid'), 'utf8'));
    t.after(() => { try { process.kill(ownedPid, 'SIGKILL'); } catch {} });
    assert.equal(child.error, undefined, child.stderr);
    assert.equal(child.signal, null);
    assert.equal(child.status, 1);
    const report = JSON.parse(await readFile(join(directory, manifestName), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.scenarios.length, 72);
    assert.equal(report.cleanupIncomplete, true);
    assert.equal(report.setupFailure, mode === 'global_watchdog' ? 'SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED' : 'BROWSER_CLOSE_FAILED');
    assert.equal(report.failedPhase, mode === 'global_watchdog' ? 'browser_launch' : 'browser_close');
    // Signal delivery/reaping is asynchronous. Observe only this owned fixture
    // for a bounded interval; an exited orphan may briefly remain as a zombie.
    const stoppedDeadline = performance.now() + 500;
    while (true) {
      try { if (/^\d+ \(.+\) Z /.test(readFileSync(`/proc/${ownedPid}/stat`, 'utf8'))) break; }
      catch (error) { if (error.code === 'ENOENT') break; throw error; }
      assert.ok(performance.now() < stoppedDeadline, 'owned process must not still be running');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  });
}
