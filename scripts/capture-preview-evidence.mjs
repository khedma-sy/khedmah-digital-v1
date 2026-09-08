import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const evidenceRoutes = Object.freeze([
  { key: 'home', path: '/', formName: '' },
  { key: 'categories', path: '/categories', formName: '' },
  { key: 'professional-search', path: '/professional-profiles/search', formName: 'بحث عن مهنيين' }
]);
export const evidenceViewports = Object.freeze([
  { key: 'desktop', width: 1280, height: 800 },
  { key: 'mobile', width: 390, height: 844 }
]);

export function validateBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Evidence requires a credential-free HTTPS origin without a path, query or fragment.');
  }
  return url.origin;
}

// Runs in Chromium. It records DOM evidence, not a claim of complete visual QA.
export function browserSnapshot(formName = '') {
  const visible = (element) => !!element && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';
  const elements = (selector) => [...document.querySelectorAll(selector)].filter(visible);
  const main = document.querySelector('main#foundation-content');
  const form = document.querySelector('form[aria-label]');
  const navigation = elements('.khedma-header .nav-discovery');
  const interactiveNavigation = navigation.filter((link) => {
    const rect = link.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    // The baseline may use older sizing; the new shell separately targets 44px.
    return link.tabIndex >= 0 && rect.height >= 24 && rect.width >= 24
      && rect.left >= 0 && rect.right <= document.documentElement.clientWidth
      && rect.top >= 0 && rect.bottom <= document.documentElement.clientHeight
      && !!hit && link.contains(hit);
  });
  return {
    headerCount: elements('.khedma-header').length,
    mainCount: elements('main#foundation-content').length,
    headingLength: main?.querySelector('h1')?.textContent?.trim().length ?? 0,
    navigationCount: navigation.length,
    navigationInteractiveCount: interactiveNavigation.length,
    navigationHrefs: navigation.map((link) => link.getAttribute('href')),
    authReady: !!document.querySelector('.nav-session[data-auth-state="guest"], .nav-session[data-auth-state="authenticated"]'),
    busyCount: elements('[aria-busy="true"]').length,
    alertCount: elements('[role="alert"], .ui-status-danger, .ui-status-warning').length,
    fontStatus: document.fonts.status,
    overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    formNamed: !formName || (visible(form) && form.getAttribute('aria-label') === formName)
  };
}

export function assessEvidence(snapshot, httpStatus, pathMatches, pageErrorCount = 0) {
  const failures = [];
  if (!(httpStatus >= 200 && httpStatus < 300)) failures.push('HTTP_NOT_SUCCESS');
  if (!pathMatches) failures.push('UNEXPECTED_REDIRECT');
  if (snapshot.headerCount !== 1) failures.push('HEADER_MISSING_OR_DUPLICATED');
  if (snapshot.mainCount !== 1 || !snapshot.headingLength) failures.push('CONTENT_NOT_READY');
  if (snapshot.navigationCount !== 5 || !snapshot.authReady) failures.push('NAVIGATION_NOT_READY');
  if (snapshot.navigationInteractiveCount !== 5) failures.push('NAVIGATION_NOT_INTERACTIVE');
  if (snapshot.navigationHrefs?.join('|') !== '/search|/categories|/map|/mobility|/classifieds') failures.push('NAVIGATION_DESTINATIONS_CHANGED');
  if (snapshot.busyCount !== 0) failures.push('LOADING_NOT_FINISHED');
  if (snapshot.alertCount !== 0) failures.push('VISIBLE_ERROR_OR_WARNING');
  if (snapshot.fontStatus !== 'loaded') failures.push('FONTS_NOT_READY');
  if (!Number.isFinite(snapshot.overflowPx) || snapshot.overflowPx > 1) failures.push('HORIZONTAL_OVERFLOW');
  if (!snapshot.formNamed) failures.push('FORM_NAME_MISSING');
  if (pageErrorCount !== 0) failures.push('BROWSER_RUNTIME_ERROR');
  return failures;
}

// Font loading can restart after a first 'loaded' read when client content mounts.
// Force layout and await the current font set, then re-check after two rendering frames.
export async function browserReadyForCapture() {
  const ready = () => {
    const main = document.querySelector('main#foundation-content');
    const busy = [...document.querySelectorAll('[aria-busy="true"]')].some((element) => element.getClientRects().length > 0);
    return !!main?.querySelector('h1')?.textContent?.trim()
      && !!document.querySelector('.khedma-header .nav-session[data-auth-state="guest"], .khedma-header .nav-session[data-auth-state="authenticated"]')
      && !busy && document.fonts.status === 'loaded';
  };
  if (!ready()) return false;
  document.body.getBoundingClientRect();
  await document.fonts.ready;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return ready();
}

async function capture(browser, origin, target, route, viewport, directory) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
    locale: 'ar-SY', colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  const record = { target, route: route.path, viewport: viewport.key, status: 'failed', failures: [], pageErrorCount: 0 };
  page.on('pageerror', () => { record.pageErrorCount += 1; });
  try {
    const response = await page.goto(new URL(route.path, origin).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    record.httpStatus = response?.status() ?? 0;
    try {
      await page.waitForFunction(browserReadyForCapture, null, { timeout: 30000 });
    } catch {
      record.failures.push('READINESS_TIMEOUT');
    }
    record.snapshot = await page.evaluate(browserSnapshot, route.formName);
    record.failures.push(...assessEvidence(record.snapshot, record.httpStatus,
      new URL(page.url()).origin === origin && new URL(page.url()).pathname === route.path, record.pageErrorCount));
    record.status = record.failures.length ? 'failed' : 'passed';
  } catch (error) {
    record.failures.push(error?.name === 'TimeoutError' ? 'NAVIGATION_TIMEOUT' : 'CAPTURE_ERROR');
  }
  try {
    const stem = target === 'before' ? 'before' : route.key === 'home' && viewport.key === 'desktop' ? 'after' : `after-${route.key}-${viewport.key}`;
    record.screenshot = `${stem}${record.status === 'passed' ? '' : '-diagnostic'}.png`;
    await page.screenshot({ path: resolve(directory, record.screenshot), fullPage: true, timeout: 10000 });
  } catch {
    record.failures.push('SCREENSHOT_UNAVAILABLE');
    record.status = 'failed';
    delete record.screenshot;
  } finally {
    await context.close();
  }
  return record;
}

function readOrigin(env, key) {
  if (typeof env[key] !== 'string' || !env[key].trim()) {
    return { failure: `${key}_MISSING` };
  }
  try { return { origin: validateBaseUrl(env[key].trim()) }; }
  catch { return { failure: `${key}_INVALID` }; }
}

async function launchChromium(env) {
  if (typeof env.PLAYWRIGHT_PACKAGE_JSON !== 'string' || !env.PLAYWRIGHT_PACKAGE_JSON.trim()) {
    throw Object.assign(new Error('Browser tooling path is required.'), { code: 'BROWSER_TOOLING_PATH_MISSING' });
  }
  const requirePlaywright = createRequire(resolve(env.PLAYWRIGHT_PACKAGE_JSON));
  const { chromium } = requirePlaywright('playwright');
  return chromium.launch({ headless: true });
}

export async function main(env = process.env, { launchBrowser = launchChromium } = {}) {
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  await mkdir(directory, { recursive: true });
  const report = { schemaVersion: 2, capturedAt: new Date().toISOString(),
    headSha: env.PREVIEW_HEAD_SHA || null, checkoutSha: env.GITHUB_SHA || null,
    scope: 'Anonymous light-theme readiness: home, categories, professional search; desktop and mobile. Staging homepage is an environment baseline, not a verified parent-commit snapshot. No login, writes, business transactions or full accessibility audit.',
    status: 'failed', previewStatus: 'not_run', before: null, after: [] };
  const before = readOrigin(env, 'BEFORE_URL');
  const after = readOrigin(env, 'AFTER_URL');
  if (before.origin && before.origin === after.origin) before.failure = 'BASELINE_EQUALS_PREVIEW';
  if (before.failure) {
    report.before = { target: 'before', route: '/', viewport: 'desktop', status: 'blocked', failures: [before.failure] };
  }
  let browser;
  let stage = 'configuration';
  try {
    if (after.failure) {
      report.setupFailure = after.failure;
    } else {
      stage = 'browser-launch';
      browser = await launchBrowser(env);
      report.browserVersion = browser.version();
      stage = 'capture';
      // A missing baseline blocks comparison, not collection of Preview diagnostics.
      if (!before.failure) {
        try { report.before = await capture(browser, before.origin, 'before', evidenceRoutes[0], evidenceViewports[0], directory); }
        catch { report.before = { target: 'before', route: '/', viewport: 'desktop', status: 'failed', failures: ['CAPTURE_SETUP_OR_CLEANUP_FAILED'] }; }
      }
      for (const route of evidenceRoutes) {
        const results = await Promise.allSettled(evidenceViewports.map((viewport) => capture(browser, after.origin, 'after', route, viewport, directory)));
        report.after.push(...results.map((result, index) => result.status === 'fulfilled' ? result.value : {
          target: 'after', route: route.path, viewport: evidenceViewports[index].key,
          status: 'failed', failures: ['CAPTURE_SETUP_OR_CLEANUP_FAILED'], pageErrorCount: 0
        }));
      }
      report.previewStatus = report.after.length === 6 && report.after.every((item) => item.status === 'passed') ? 'passed' : 'failed';
      report.status = report.before?.status === 'passed' && report.previewStatus === 'passed' ? 'passed' : 'failed';
    }
  } catch (error) {
    report.setupFailure = error?.code === 'BROWSER_TOOLING_PATH_MISSING' ? error.code
      : stage === 'browser-launch' ? 'BROWSER_LAUNCH_FAILED' : 'CAPTURE_SETUP_FAILED';
  } finally {
    if (browser) {
      try { await browser.close(); }
      catch { report.setupFailure = 'BROWSER_CLOSE_FAILED'; report.status = 'failed'; }
    }
    await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Preview evidence: ${report.status}; ${report.after.filter((item) => item.status === 'passed').length}/6 after scenarios ready; baseline ${report.before?.status ?? 'unavailable'}.`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = await main();
  if (report.status !== 'passed') process.exitCode = 1;
}
