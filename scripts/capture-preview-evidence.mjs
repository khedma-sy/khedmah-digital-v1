import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const evidenceRoutes = Object.freeze([
  { key: 'home', path: '/', formName: '' },
  { key: 'categories', path: '/categories', formName: '' },
  { key: 'search', path: '/search', formName: 'البحث في خدمة' },
  { key: 'map', path: '/map', formName: 'البحث عن الأنشطة على الخريطة' },
  { key: 'professional-search', path: '/professional-profiles/search', formName: 'بحث عن مهنيين' }
]);
export const evidenceViewports = Object.freeze([
  { key: 'desktop', width: 1280, height: 800 },
  { key: 'mobile', width: 390, height: 844 },
  { key: 'small-mobile', width: 320, height: 740 },
  { key: 'tablet', width: 768, height: 1024 }
]);

export const evidenceThemes = Object.freeze(['light', 'dark']);
const expectedCaptures = evidenceRoutes.length * evidenceViewports.length * evidenceThemes.length;

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
  const images = main ? [...main.querySelectorAll('img')].filter((image) => {
    const style = getComputedStyle(image);
    return image.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      && !!(image.currentSrc || image.getAttribute('src'));
  }) : [];
  const incompleteImages = images.filter((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0);
  const mapRuntimeStatus = main?.getAttribute('data-map-status') ?? null;
  const mapRenderStatus = main?.getAttribute('data-map-render-status') ?? null;
  // Inspect our own surface, not undocumented Google Maps child elements.
  const surface = document.querySelector('[data-map-surface]');
  const mapRect = surface?.getBoundingClientRect();
  const mapSurfaceVisible = visible(surface) && mapRect.width >= 128 && mapRect.height >= 128;
  const mapReady = mapRuntimeStatus === 'ready' && mapRenderStatus === 'ready' && mapSurfaceVisible;
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
    theme: document.documentElement.dataset.theme,
    mapStatus: mapRuntimeStatus === null ? null : mapReady ? 'ready' : mapRuntimeStatus === 'error' ? 'error' : 'loading',
    mapRuntimeStatus,
    mapRenderStatus,
    mapSurfaceVisible,
    mapSurfaceSize: mapRect ? { width: mapRect.width, height: mapRect.height } : null,
    headerCount: elements('.khedma-header').length,
    mainCount: elements('main#foundation-content').length,
    headingLength: main?.querySelector('h1')?.textContent?.trim().length ?? 0,
    navigationCount: navigation.length,
    navigationInteractiveCount: interactiveNavigation.length,
    navigationHrefs: navigation.map((link) => link.getAttribute('href')),
    authReady: !!document.querySelector('.nav-session[data-auth-state="guest"], .nav-session[data-auth-state="authenticated"]'),
    busyCount: elements('[aria-busy="true"]').length,
    alertCount: elements('[role="alert"], .ui-status-danger, .ui-status-warning').length,
    imageCount: images.length,
    incompleteImageCount: incompleteImages.length,
    fontStatus: document.fonts.status,
    overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    formNamed: !formName || (visible(form) && form.getAttribute('aria-label') === formName)
  };
}

export function assessEvidence(snapshot, httpStatus, pathMatches, pageErrorCount = 0, expectedTheme = 'light') {
  const failures = [];
  if (snapshot.theme !== expectedTheme) failures.push('THEME_NOT_APPLIED');
  if (snapshot.mapStatus !== null && snapshot.mapStatus !== undefined && snapshot.mapStatus !== 'ready') failures.push('MAP_NOT_READY');
  if (!(httpStatus >= 200 && httpStatus < 300)) failures.push('HTTP_NOT_SUCCESS');
  if (!pathMatches) failures.push('UNEXPECTED_REDIRECT');
  if (snapshot.headerCount !== 1) failures.push('HEADER_MISSING_OR_DUPLICATED');
  if (snapshot.mainCount !== 1 || !snapshot.headingLength) failures.push('CONTENT_NOT_READY');
  if (snapshot.navigationCount !== 5 || !snapshot.authReady) failures.push('NAVIGATION_NOT_READY');
  if (snapshot.navigationInteractiveCount !== 5) failures.push('NAVIGATION_NOT_INTERACTIVE');
  if (snapshot.navigationHrefs?.join('|') !== '/search|/categories|/map|/taxi|/classifieds') failures.push('NAVIGATION_DESTINATIONS_CHANGED');
  if (snapshot.busyCount !== 0) failures.push('LOADING_NOT_FINISHED');
  if (snapshot.alertCount !== 0) failures.push('VISIBLE_ERROR_OR_WARNING');
  if ((snapshot.incompleteImageCount ?? 0) !== 0) failures.push('IMAGES_NOT_READY');
  if (snapshot.fontStatus !== 'loaded') failures.push('FONTS_NOT_READY');
  if (!Number.isFinite(snapshot.overflowPx) || snapshot.overflowPx > 1) failures.push('HORIZONTAL_OVERFLOW');
  if (!snapshot.formNamed) failures.push('FORM_NAME_MISSING');
  if (pageErrorCount !== 0) failures.push('BROWSER_RUNTIME_ERROR');
  return failures;
}

// Playwright polls this synchronously: a Promise is truthy even when it resolves
// to false. Never pass the asynchronous font-settling function as its predicate.
export function browserContentReadyForCapture() {
  const main = document.querySelector('main#foundation-content');
  const surface = main?.hasAttribute('data-map-status') ? document.querySelector('[data-map-surface]') : null;
  const rect = surface?.getBoundingClientRect();
  const mapReady = !main?.hasAttribute('data-map-status') || (main.getAttribute('data-map-status') === 'ready'
    && main.getAttribute('data-map-render-status') === 'ready' && !!surface?.getClientRects().length
    && getComputedStyle(surface).visibility !== 'hidden' && rect.width >= 128 && rect.height >= 128);
  const busy = [...document.querySelectorAll('[aria-busy="true"]')].some((element) => element.getClientRects().length > 0);
  return !!main?.querySelector('h1')?.textContent?.trim()
    && !!document.querySelector('.khedma-header .nav-session[data-auth-state="guest"], .khedma-header .nav-session[data-auth-state="authenticated"]')
    && !busy && mapReady
    && document.fonts.status === 'loaded';
}

// Font loading can restart after a first 'loaded' read when client content mounts.
// Force layout and await the current font set, then re-check after two rendering frames.
export async function browserReadyForCapture() {
  const ready = () => {
    const main = document.querySelector('main#foundation-content');
    const surface = main?.hasAttribute('data-map-status') ? document.querySelector('[data-map-surface]') : null;
    const rect = surface?.getBoundingClientRect();
    const mapReady = !main?.hasAttribute('data-map-status') || (main.getAttribute('data-map-status') === 'ready'
      && main.getAttribute('data-map-render-status') === 'ready' && !!surface?.getClientRects().length
      && getComputedStyle(surface).visibility !== 'hidden' && rect.width >= 128 && rect.height >= 128);
    const busy = [...document.querySelectorAll('[aria-busy="true"]')].some((element) => element.getClientRects().length > 0);
    return !!main?.querySelector('h1')?.textContent?.trim()
      && !!document.querySelector('.khedma-header .nav-session[data-auth-state="guest"], .khedma-header .nav-session[data-auth-state="authenticated"]')
      && !busy && mapReady
      && document.fonts.status === 'loaded';
  };
  if (!ready()) return false;
  document.body.getBoundingClientRect();
  await document.fonts.ready;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return ready();
}

// Full-page screenshots do not guarantee browser-native lazy images have intersected
// the viewport. Walk the document before capture, wait for rendered images to settle,
// then restore the original scroll position so evidence represents the real page.
export async function browserPrepareFullPageCapture() {
  const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const step = Math.max(128, Math.floor(viewportHeight * 0.75));
  const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
  for (let y = 0; y < documentHeight; y += step) {
    window.scrollTo(0, y);
    await frame();
  }
  window.scrollTo(0, documentHeight);
  await frame();
  const renderedImages = [...document.querySelectorAll('main#foundation-content img')].filter((image) => {
    const style = getComputedStyle(image);
    return image.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      && !!(image.currentSrc || image.getAttribute('src'));
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && renderedImages.some((image) => !image.complete)) {
    await new Promise((done) => setTimeout(done, 50));
  }
  await frame();
  const incompleteImageCount = renderedImages.filter((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0).length;
  window.scrollTo(originalX, originalY);
  await frame();
  return { imageCount: renderedImages.length, incompleteImageCount };
}

export async function waitForCaptureReadiness(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForFunction(browserContentReadyForCapture, null, { timeout: Math.max(1, deadline - Date.now()) });
    // evaluate awaits the returned Promise; require a boolean true, never a handle.
    if (await page.evaluate(browserReadyForCapture) === true) return;
  }
  throw new Error('Capture readiness deadline exceeded.');
}

async function capture(browser, origin, target, route, viewport, directory, theme = 'light') {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
    locale: 'ar-SY', colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  const record = { target, route: route.path, viewport: viewport.key, theme, status: 'failed', failures: [], pageErrorCount: 0 };
  page.on('pageerror', () => { record.pageErrorCount += 1; });
  try {
    const response = await page.goto(new URL(route.path, origin).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    record.httpStatus = response?.status() ?? 0;
    try {
      await waitForCaptureReadiness(page);
    } catch {
      record.failures.push('READINESS_TIMEOUT');
    }
    try {
      record.imageReadiness = await page.evaluate(browserPrepareFullPageCapture);
    } catch {
      record.failures.push('IMAGE_READINESS_ERROR');
    }
    record.snapshot = await page.evaluate(browserSnapshot, route.formName);
    record.failures.push(...assessEvidence(record.snapshot, record.httpStatus,
      new URL(page.url()).origin === origin && new URL(page.url()).pathname === route.path, record.pageErrorCount, theme));
    record.status = record.failures.length ? 'failed' : 'passed';
  } catch (error) {
    record.failures.push(error?.name === 'TimeoutError' ? 'NAVIGATION_TIMEOUT' : 'CAPTURE_ERROR');
  }
  try {
    const stem = target === 'before' ? 'before' : route.key === 'home' && viewport.key === 'desktop' ? 'after' : `after-${route.key}-${viewport.key}`;
    record.screenshot = `${stem}${theme === 'dark' ? '-dark' : ''}${record.status === 'passed' ? '' : '-diagnostic'}.png`;
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
  const report = { schemaVersion: 5, capturedAt: new Date().toISOString(),
    headSha: env.PREVIEW_HEAD_SHA || null, checkoutSha: env.GITHUB_SHA || null,
    scope: 'Anonymous readiness: home, categories, search, map, professional search; light/dark at 320, 390, 768 and 1280px. Full-page capture scrolls through rendered content to trigger browser-native lazy images and rejects incomplete rendered images. Map checks require the runtime, tilesloaded rendering evidence and a visible non-collapsed surface; they do not certify GPS or marker data. Staging homepage is an environment baseline, not a verified parent-commit snapshot. No login, writes, business transactions or full accessibility audit.',
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
        for (const theme of evidenceThemes) {
          const results = await Promise.allSettled(evidenceViewports.map((viewport) => capture(browser, after.origin, 'after', route, viewport, directory, theme)));
          report.after.push(...results.map((result, index) => result.status === 'fulfilled' ? result.value : {
            target: 'after', route: route.path, viewport: evidenceViewports[index].key, theme,
            status: 'failed', failures: ['CAPTURE_SETUP_OR_CLEANUP_FAILED'], pageErrorCount: 0
          }));
        }
      }
      report.previewStatus = report.after.length === expectedCaptures && report.after.every((item) => item.status === 'passed') ? 'passed' : 'failed';
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
  console.log(`Preview evidence: ${report.status}; ${report.after.filter((item) => item.status === 'passed').length}/${expectedCaptures} after scenarios ready; baseline ${report.before?.status ?? 'unavailable'}.`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = await main();
  if (report.status !== 'passed') process.exitCode = 1;
}
