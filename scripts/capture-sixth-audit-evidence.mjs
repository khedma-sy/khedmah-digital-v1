import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureClassifiedsActionContrast } from './classifieds-action-contrast.mjs';
import { assessInlineLayout, browserInlineLayout } from './sixth-audit-layout.mjs';
import { assessAuthEvidence, browserAuthShell, measurePageDesign } from './page-design-evidence.mjs';
import {
  assessEvidence,
  browserPrepareFullPageCapture,
  browserSnapshot,
  evidenceThemes,
  evidenceViewports,
  validateBaseUrl,
  waitForCaptureReadiness
} from './capture-preview-evidence.mjs';

export const sixthAuditRoutes = Object.freeze([
  { key: 'restaurants', path: '/restaurants', href: '/restaurants', formName: '' },
  { key: 'delivery', path: '/mobility', href: '/mobility?type=delivery', formName: 'البحث عن تكسي أو مندوب', search: 'type=delivery' },
  { key: 'classifieds', path: '/classifieds', href: '/classifieds', formName: 'البحث في إعلانات خدمة' },
  { key: 'courier-signup', path: '/courier-signup', href: '/courier-signup', formName: '' },
  { key: 'billing', path: '/billing', href: '/billing', formName: '' },
  { key: 'taxi-pricing', path: '/admin/taxi-pricing', href: '/admin/taxi-pricing', formName: '' },
  { key: 'taxi-signup', path: '/taxi-driver-signup', href: '/taxi-driver-signup', formName: '' },
  { key: 'login', path: '/auth/login', href: '/auth/login', formName: 'تسجيل الدخول', authShell: true },
  { key: 'register', path: '/auth/register', href: '/auth/register', formName: 'إنشاء حساب', authShell: true }
]);

const expectedScenarios = sixthAuditRoutes.length * evidenceViewports.length * evidenceThemes.length;
const manifestName = 'sixth-audit-visual-manifest.json';
export const captureLimits = Object.freeze({ globalMs: 480000, scenarioMs: 45000, launchMs: 30000, screenshotMs: 12000, cleanupMs: 5000 });
const realClock = { now: () => performance.now(), setTimeout, clearTimeout };

function checkpoint(directory, report) {
  const path = resolve(directory, manifestName);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporary, path);
}

class CaptureDeadlineError extends Error {
  constructor(code, phase) {
    super(code);
    this.code = code;
    this.phase = phase;
  }
}

// Only the winning await owns a result. A late browser/context is disposed of
// without access to report state; a late screenshot never receives a file path.
function bounded(action, { deadline, code, phase, clock, disposeLate }) {
  const remaining = deadline - clock.now();
  if (remaining <= 0) return Promise.reject(new CaptureDeadlineError(code, phase));
  return new Promise((resolveResult, reject) => {
    let expired = false;
    const expire = () => {
      expired = true;
      reject(new CaptureDeadlineError(code, phase));
    };
    const timer = clock.setTimeout(expire, remaining);
    Promise.resolve().then(action).then((value) => {
      if (!expired && clock.now() >= deadline) expire();
      clock.clearTimeout(timer);
      if (expired) {
        if (disposeLate) void Promise.resolve().then(() => disposeLate(value)).catch(() => {});
        return;
      }
      resolveResult(value);
    }, (error) => {
      if (expired) return;
      clock.clearTimeout(timer);
      reject(error);
    });
  });
}

async function launchBrowser(env) {
  if (!env.PLAYWRIGHT_PACKAGE_JSON?.trim()) throw new Error('BROWSER_TOOLING_PATH_MISSING');
  const { chromium } = createRequire(resolve(env.PLAYWRIGHT_PACKAGE_JSON))('playwright');
  return chromium.launch({ headless: true });
}

function directionSnapshot() {
  return {
    htmlDir: document.documentElement.dir,
    bodyDirection: getComputedStyle(document.body).direction
  };
}

function routeMatches(url, origin, route) {
  if (url.origin !== origin || url.pathname !== route.path) return false;
  if (!route.search) return url.search === '';
  return url.searchParams.toString() === route.search;
}

export async function main(env = process.env, { launch = launchBrowser, limits = captureLimits, clock = realClock, log = console.log } = {}) {
  const globalDeadline = clock.now() + limits.globalMs;
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  mkdirSync(directory, { recursive: true });
  const scenarios = sixthAuditRoutes.flatMap((route) => evidenceViewports.flatMap((viewport) =>
    evidenceThemes.map((theme) => ({ route, viewport, theme, record: {
      route: route.href, key: route.key, viewport: viewport.key, width: viewport.width, height: viewport.height,
      theme, status: 'failed', completed: false, phase: 'not_started', failures: ['SIXTH_AUDIT_NOT_RUN'], pageErrorCount: 0
    } }))));
  const report = {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    headSha: env.PREVIEW_HEAD_SHA || null,
    checkoutSha: env.GITHUB_SHA || null,
    status: 'failed',
    expectedScenarios,
    limits: { ...limits },
    scope: 'Anonymous After-only visual readiness for Restaurants, independent Delivery, Classifieds, courier signup, Billing catalog, Taxi pricing entry, guest Taxi signup, Login and Register. Four governed viewports, light/dark, RTL. Account pages use an explicit auth-shell gate. No credentials, authentication, location permission, form submission or server writes.',
    scenarios: scenarios.map(({ record }) => record)
  };
  const stage = (record, phase, action, scenarioDeadline = Infinity, maximumMs = Infinity, disposeLate) => {
    if (record) record.phase = phase;
    report.progress = { phase, scenario: record ? report.scenarios.indexOf(record) + 1 : null, updatedAt: new Date().toISOString() };
    checkpoint(directory, report);
    const operationDeadline = clock.now() + maximumMs;
    const deadline = Math.min(globalDeadline, scenarioDeadline, operationDeadline);
    const code = deadline === globalDeadline ? 'SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED'
      : deadline === scenarioDeadline ? 'SIXTH_AUDIT_SCENARIO_DEADLINE_EXCEEDED' : 'SIXTH_AUDIT_TIMEOUT';
    return bounded(action, { deadline, code, phase, clock, disposeLate });
  };
  checkpoint(directory, report);
  let browser;
  let abortCode;
  try {
    const origin = validateBaseUrl(env.AFTER_URL);
    try {
      browser = await stage(null, 'browser_launch', () => launch(env), Infinity, limits.launchMs, (lateBrowser) => lateBrowser.close());
    } catch (error) {
      if (error instanceof CaptureDeadlineError) report.cleanupIncomplete = true;
      throw error;
    }

    for (const { route, viewport, theme, record } of scenarios) {
      if (abortCode || clock.now() >= globalDeadline) {
        record.failures = [abortCode || 'SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED'];
        continue;
      }
      const scenarioDeadline = clock.now() + limits.scenarioMs;
      record.failures = [];
      log(`Sixth audit ${report.scenarios.indexOf(record) + 1}/${expectedScenarios}: ${route.key}/${viewport.key}/${theme}.`);
      const captureStage = (phase, action, maximumMs = Infinity, disposeLate) =>
        stage(record, phase, action, scenarioDeadline, maximumMs, disposeLate);
      let context;
      let page;
      let acceptPageErrors = true;
      try {
        context = await captureStage('context_create', () => browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          locale: 'ar-SY',
          colorScheme: theme,
          reducedMotion: 'reduce',
          deviceScaleFactor: 1
        }), Infinity, (lateContext) => lateContext.close());
        page = await captureStage('page_create', () => context.newPage());
        page.on('pageerror', () => { if (acceptPageErrors) record.pageErrorCount += 1; });
        const response = await captureStage('navigation', () => page.goto(new URL(route.href, origin).href, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        }), 30000);
        record.httpStatus = response?.status() ?? 0;
        try {
          await captureStage('readiness', () => waitForCaptureReadiness(page, 30000), 30000);
        } catch (error) {
          if (error instanceof CaptureDeadlineError) throw error;
          record.failures.push('READINESS_TIMEOUT');
        }
        try {
          record.imageReadiness = await captureStage('full_page_prepare', () => page.evaluate(browserPrepareFullPageCapture));
        } catch (error) {
          if (error instanceof CaptureDeadlineError) throw error;
          record.failures.push('IMAGE_READINESS_ERROR');
        }
        try {
          await captureStage('final_readiness', () => waitForCaptureReadiness(page, 30000), 30000);
        } catch (error) {
          if (error instanceof CaptureDeadlineError) throw error;
          record.failures.push('FINAL_READINESS_TIMEOUT');
        }
        const current = new URL(page.url());
        record.snapshot = await captureStage('snapshot', () => page.evaluate(browserSnapshot, route.formName));
        record.direction = await captureStage('direction', () => page.evaluate(directionSnapshot));
        if (route.authShell) {
          record.authShell = await captureStage('auth_shell', () => page.evaluate(browserAuthShell));
          record.failures.push(...assessAuthEvidence(record.snapshot, record.authShell, record.httpStatus,
            routeMatches(current, origin, route), record.pageErrorCount, theme));
        } else record.failures.push(...assessEvidence(
          record.snapshot,
          record.httpStatus,
          routeMatches(current, origin, route),
          record.pageErrorCount,
          theme,
          false
        ));
        if (record.direction.htmlDir !== 'rtl' || record.direction.bodyDirection !== 'rtl') {
          record.failures.push('RTL_NOT_APPLIED');
        }
        if (route.key === 'classifieds') {
          record.actionContrast = await captureStage('classifieds_action_contrast', () => measureClassifiedsActionContrast(page));
          record.failures.push(...record.actionContrast.failures);
        }
        record.pageDesign = await captureStage('page_design', () => measurePageDesign(page, route.key));
        record.failures.push(...record.pageDesign.failures);
        // Check after keyboard traversal, which can scroll hidden RTL overflow
        // and clip unrelated headings even when document overflow is zero.
        record.inlineLayout = await captureStage('inline_layout', () => page.evaluate(browserInlineLayout));
        record.inlineLayoutAssessment = assessInlineLayout(record.inlineLayout);
        record.failures.push(...record.inlineLayoutAssessment.failures);
      } catch (error) {
        record.failedPhase = error?.phase || record.phase;
        record.failures.push(error instanceof CaptureDeadlineError ? error.code
          : error?.name === 'TimeoutError' ? 'SIXTH_AUDIT_TIMEOUT' : 'SIXTH_AUDIT_CAPTURE_ERROR');
      } finally {
        acceptPageErrors = false;
        if (page) {
          try {
            const screenshot = `sixth-after-${route.key}-${viewport.key}-${theme}${record.failures.length ? '-diagnostic' : ''}.png`;
            const bytes = await stage(record, 'screenshot', () => page.screenshot({ fullPage: true, timeout: 12000 }), Infinity, limits.screenshotMs);
            writeFileSync(resolve(directory, screenshot), bytes);
            record.screenshot = screenshot;
          } catch (error) {
            record.failedPhase ||= error?.phase || record.phase;
            record.failures.push('SCREENSHOT_UNAVAILABLE');
            if (error instanceof CaptureDeadlineError) record.failures.push(error.code);
          }
        }
        if (context) {
          try { await stage(record, 'context_close', () => context.close(), Infinity, limits.cleanupMs); }
          catch (error) {
            record.failedPhase ||= error?.phase || record.phase;
            record.failures.push('CONTEXT_CLOSE_FAILED');
            if (error instanceof CaptureDeadlineError) record.failures.push(error.code);
            abortCode = error?.code === 'SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED' ? error.code : 'SIXTH_AUDIT_CAPTURE_ABORTED';
          }
        }
        record.status = record.failures.length ? 'failed' : 'passed';
        record.completed = true;
        record.phase = 'completed';
        checkpoint(directory, report);
        log(`Sixth audit ${route.key}/${viewport.key}/${theme}: ${record.status}${record.failedPhase ? ` at ${record.failedPhase}` : ''}.`);
      }
    }
  } catch (error) {
    report.failedPhase = error?.phase || report.progress?.phase;
    report.setupFailure = error instanceof CaptureDeadlineError ? error.code : error?.message === 'BROWSER_TOOLING_PATH_MISSING'
      ? 'BROWSER_TOOLING_PATH_MISSING'
      : 'SIXTH_AUDIT_SETUP_FAILED';
  } finally {
    if (browser) {
      try { await stage(null, 'browser_close', () => browser.close(), Infinity, limits.cleanupMs); }
      catch { report.status = 'failed'; report.failedPhase = 'browser_close'; report.setupFailure = 'BROWSER_CLOSE_FAILED'; report.cleanupIncomplete = true; }
    }
    if (!report.setupFailure) report.status = report.scenarios.length === expectedScenarios
      && report.scenarios.every((scenario) => scenario.completed && scenario.status === 'passed') ? 'passed' : 'failed';
    report.progress = { phase: 'completed', scenario: null, updatedAt: new Date().toISOString() };
    checkpoint(directory, report);
  }
  const passed = report.scenarios.filter((scenario) => scenario.status === 'passed').length;
  log(`Sixth audit visual evidence: ${passed}/${expectedScenarios}; ${report.status}.`);
  return report;
}

// Only CLI entry points use process termination. Playwright's exit handler kills
// its owned browser process groups even when protocol-based close is stalled.
export async function runCli(env = process.env) {
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  const watchdog = setTimeout(() => {
    try {
      const report = JSON.parse(readFileSync(resolve(directory, manifestName), 'utf8'));
      report.status = 'failed';
      report.setupFailure = 'SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED';
      report.failedPhase = report.progress?.phase;
      report.cleanupIncomplete = true;
      for (const record of report.scenarios) {
        if (!record.completed) {
          record.status = 'failed';
          record.failedPhase ||= record.phase;
          record.failures = [...new Set([...record.failures, 'SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED'])];
        }
      }
      checkpoint(directory, report);
    } finally { process.exit(1); }
  }, captureLimits.globalMs);
  try {
    const report = await main(env);
    if (report.cleanupIncomplete) process.exit(1);
    return report;
  } finally { clearTimeout(watchdog); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if ((await runCli()).status !== 'passed') process.exitCode = 1;
}
