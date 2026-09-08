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
  return {
    headerCount: elements('.khedma-header').length,
    mainCount: elements('main#foundation-content').length,
    headingLength: main?.querySelector('h1')?.textContent?.trim().length ?? 0,
    navigationCount: elements('.khedma-header .nav-discovery').length,
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
  if (snapshot.busyCount !== 0) failures.push('LOADING_NOT_FINISHED');
  if (snapshot.alertCount !== 0) failures.push('VISIBLE_ERROR_OR_WARNING');
  if (snapshot.fontStatus !== 'loaded') failures.push('FONTS_NOT_READY');
  if (!Number.isFinite(snapshot.overflowPx) || snapshot.overflowPx > 1) failures.push('HORIZONTAL_OVERFLOW');
  if (!snapshot.formNamed) failures.push('FORM_NAME_MISSING');
  if (pageErrorCount !== 0) failures.push('BROWSER_RUNTIME_ERROR');
  return failures;
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
      await page.waitForFunction(() => {
        const main = document.querySelector('main#foundation-content');
        const busy = [...document.querySelectorAll('[aria-busy="true"]')].some((element) => element.getClientRects().length > 0);
        return !!main?.querySelector('h1')?.textContent?.trim()
          && !!document.querySelector('.khedma-header .nav-session[data-auth-state="guest"], .khedma-header .nav-session[data-auth-state="authenticated"]')
          && !busy && document.fonts.status === 'loaded';
      }, null, { timeout: 30000 });
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

export async function main(env = process.env) {
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  await mkdir(directory, { recursive: true });
  const report = { schemaVersion: 1, capturedAt: new Date().toISOString(),
    headSha: env.PREVIEW_HEAD_SHA || null, checkoutSha: env.GITHUB_SHA || null,
    scope: 'Anonymous light-theme readiness: home, categories, professional search; desktop and mobile. Staging homepage is an environment baseline, not a verified parent-commit snapshot. No login, writes, business transactions or full accessibility audit.',
    status: 'failed', before: null, after: [] };
  let browser;
  try {
    const before = validateBaseUrl(env.BEFORE_URL);
    const after = validateBaseUrl(env.AFTER_URL);
    if (before === after) throw new Error('Before and after evidence must use different origins.');
    const requirePlaywright = createRequire(resolve(env.PLAYWRIGHT_PACKAGE_JSON));
    const { chromium } = requirePlaywright('playwright');
    browser = await chromium.launch({ headless: true });
    report.browserVersion = browser.version();
    report.before = await capture(browser, before, 'before', evidenceRoutes[0], evidenceViewports[0], directory);
    for (const route of evidenceRoutes) {
      report.after.push(...await Promise.all(evidenceViewports.map((viewport) => capture(browser, after, 'after', route, viewport, directory))));
    }
    report.status = report.before.status === 'passed' && report.after.length === 6
      && report.after.every((item) => item.status === 'passed') ? 'passed' : 'failed';
  } catch (error) {
    report.setupFailure = error?.name || 'Error';
  } finally {
    if (browser) await browser.close();
    await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Preview evidence: ${report.status}; ${report.after.filter((item) => item.status === 'passed').length}/6 after scenarios ready; baseline ${report.before?.status ?? 'unavailable'}.`);
  if (report.status !== 'passed') process.exitCode = 1;
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
