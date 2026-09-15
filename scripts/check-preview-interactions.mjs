import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceRoutes, evidenceThemes, validateBaseUrl } from './capture-preview-evidence.mjs';
import { installMainFocusTrace } from './preview-focus-trace.mjs';

export function assessAssistantGeometry(snapshot) {
  const failures = [];
  const { assistant, main, header, trigger, position, viewportWidth } = snapshot;
  const box = value => value && ['top', 'bottom', 'left', 'right', 'width', 'height'].every(key => Number.isFinite(value[key]));
  if (![assistant, main, header, trigger].every(box) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return ['GEOMETRY_UNAVAILABLE'];
  if (position !== 'relative') failures.push('ASSISTANT_NOT_HEADER_ANCHORED');
  if (assistant.top < header.top - 1 || assistant.bottom > header.bottom + 1) failures.push('ASSISTANT_OUTSIDE_HEADER');
  if (header.bottom > main.top + 1) failures.push('HEADER_OVERLAPS_PAGE');
  if (trigger.width < 44 || trigger.height < 44 || trigger.left < 0 || trigger.right > viewportWidth) failures.push('ASSISTANT_TARGET_CLIPPED');
  return failures;
}

// Inspect only application-owned elements, never private account data or Maps internals.
export function assistantGeometry() {
  const rect = element => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  };
  const assistant = document.querySelector('[data-khedmah-assistant]');
  return { assistant: rect(assistant), main: rect(document.querySelector('main#foundation-content')),
    header: rect(document.querySelector('.khedma-header')), trigger: rect(assistant?.querySelector('button[aria-expanded]')),
    position: assistant ? getComputedStyle(assistant).position : null, viewportWidth: document.documentElement.clientWidth };
}

export async function lastApplicationControl(page) {
  const controls = page.locator('main#foundation-content a[href]:visible, main#foundation-content button:not([disabled]):visible, main#foundation-content input:visible');
  for (let index = (await controls.count()) - 1; index >= 0; index -= 1) {
    // Pin the DOM node before checking its owner. A live nth() locator can point
    // at an injected Google control after the provider changes the collection.
    const candidate = await controls.nth(index).elementHandle();
    // Google Maps injects its own anchors/buttons into the map surface. They are
    // provider UI, not Khedmah controls, and their DOM order is provider-owned.
    if (candidate && await candidate.evaluate(element => !element.closest('[data-map-surface="true"]'))) return candidate;
  }
  return null;
}

// Focus can scroll the viewport while late map layout is settling. Require the
// same hit-tested, focused control at stable coordinates for three frames.
// A persistent overlay still fails, with geometry retained for diagnosis.
export async function browserControlReachability(element) {
  const deadline = performance.now() + 2000;
  let previous, stableFrames = 0, sample;
  do {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const rect = element.getBoundingClientRect();
    const bounds = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const focused = element === document.activeElement;
    const active = document.activeElement;
    const hitMatches = !!hit && element.contains(hit);
    const stationary = previous && Object.keys(bounds).every(key => Math.abs(bounds[key] - previous[key]) <= 0.5);
    stableFrames = focused && hitMatches && stationary ? stableFrames + 1 : 0;
    sample = { reachable: stableFrames >= 3, focused, hitMatches, bounds, hitTag: hit?.tagName?.toLowerCase() ?? null, stableFrames,
      connected: element.isConnected, documentFocused: document.hasFocus(),
      activeTag: active?.tagName?.toLowerCase() ?? null,
      focusOwner: focused ? 'target' : active?.closest('[data-map-surface="true"]') ? 'map-provider'
        : active?.closest('[data-khedmah-assistant]') ? 'assistant'
        : active?.closest('main#foundation-content') ? 'application'
        : active === document.body || active === document.documentElement ? 'document' : 'outside-main' };
    if (sample.reachable) return sample;
    previous = bounds;
  } while (performance.now() < deadline);
  return sample;
}

export function controlReachabilityFailure(sample) {
  if (sample.reachable) return null;
  if (sample.connected === false) return 'MAIN_CONTROL_DETACHED';
  if (sample.documentFocused === false) return 'BROWSER_DOCUMENT_NOT_FOCUSED';
  if (!sample.focused) return 'MAIN_CONTROL_FOCUS_LOST';
  if (!sample.hitMatches) return 'MAIN_CONTROL_OBSCURED';
  return 'MAIN_CONTROL_UNSTABLE';
}

export async function waitForInteractionReadiness(page, timeout) {
  await page.waitForFunction(() => {
    const assistant = document.querySelector('[data-khedmah-assistant]');
    const trigger = assistant?.querySelector('button[aria-expanded]');
    const shellReady = !!trigger && !!document.querySelector('main#foundation-content') && !!document.querySelector('.khedma-header');
    const fontsReady = !document.fonts || document.fonts.status === 'loaded';
    const ownedBusyCount = document.querySelectorAll('[aria-busy="true"]').length;
    return shellReady && fontsReady && ownedBusyCount === 0;
  }, null, { timeout });
}

const requireCondition = (value, code) => { if (!value) throw Object.assign(new Error(code), { code }); };

export async function main(env = process.env) {
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  await mkdir(directory, { recursive: true });
  const widths = [320, 390];
  const expectedScenarios = evidenceRoutes.length * widths.length * evidenceThemes.length;
  const report = { schemaVersion: 2, capturedAt: new Date().toISOString(), headSha: env.PREVIEW_HEAD_SHA || null,
    deployedHeadSha: env.PREVIEW_DEPLOYED_HEAD_SHA || env.PREVIEW_HEAD_SHA || null,
    checkoutSha: env.GITHUB_SHA || null, status: 'failed',
    scope: `Anonymous mobile UI only: ${evidenceRoutes.length} evidence routes at 320/390px and light/dark. Open/close assistant, Escape, focus return, and reachability of the last visible Khedmah-owned main control. Provider map internals are excluded from application-control reachability. Map-provider readiness is intentionally assessed by visual evidence, not duplicated here. No microphone, location permission, authentication, form submission or server writes.`, scenarios: [] };
  let browser;
  try {
    const origin = validateBaseUrl(env.AFTER_URL);
    requireCondition(env.PLAYWRIGHT_PACKAGE_JSON?.trim(), 'BROWSER_TOOLING_PATH_MISSING');
    const { chromium } = createRequire(resolve(env.PLAYWRIGHT_PACKAGE_JSON))('playwright');
    browser = await chromium.launch({ headless: true });
    const globalDeadline = Date.now() + 600000;
    for (const route of evidenceRoutes) for (const width of widths) for (const theme of evidenceThemes) {
      const record = { route: route.path, width, theme, status: 'failed', failures: [], pageErrorCount: 0 };
      report.scenarios.push(record);
      if (Date.now() >= globalDeadline) { record.failures.push('INTERACTION_GLOBAL_DEADLINE_EXCEEDED'); continue; }
      const scenarioDeadline = Math.min(globalDeadline, Date.now() + 45000);
      let context, page;
      const stem = `interaction-${route.key}-${width}-${theme}`;
      try {
        context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 844 }, locale: 'ar-SY', colorScheme: theme, reducedMotion: 'reduce' });
        page = await context.newPage(); page.setDefaultTimeout(6000);
        await page.addInitScript(installMainFocusTrace);
        page.on('pageerror', () => { record.pageErrorCount += 1; });
        const response = await page.goto(new URL(route.path, origin).href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        requireCondition(response?.ok(), 'HTTP_NOT_SUCCESS');
        await waitForInteractionReadiness(page, Math.max(1, Math.min(30000, scenarioDeadline - Date.now())));
        requireCondition(new URL(page.url()).origin === origin && new URL(page.url()).pathname === route.path, 'UNEXPECTED_REDIRECT');
        record.geometry = await page.evaluate(assistantGeometry);
        record.failures.push(...assessAssistantGeometry(record.geometry));
        requireCondition(record.failures.length === 0, 'ASSISTANT_GEOMETRY_FAILED');
        const url = page.url();
        // Keep the trigger locator stable while aria-label and aria-expanded change as the panel opens/closes.
        const trigger = page.locator('[data-khedmah-assistant] button[aria-expanded]').first();
        requireCondition(await trigger.getAttribute('aria-label') === 'فتح مساعد خدمة', 'ASSISTANT_TRIGGER_LABEL_INVALID');
        await trigger.click();
        const input = page.getByRole('textbox', { name: 'طلبك للمساعد', exact: true });
        await input.waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'طلبك للمساعد', null, { timeout: 6000 });
        record.inputFocused = true;
        record.openScreenshot = `${stem}-open.png`;
        await page.screenshot({ path: resolve(directory, record.openScreenshot), fullPage: true, timeout: 10000 });
        await input.press('Escape');
        await page.locator('#khedmah-assistant-panel').waitFor({ state: 'detached' });
        requireCondition(await trigger.evaluate(element => element === document.activeElement), 'ESCAPE_FOCUS_NOT_RESTORED');
        record.escapeFocusRestored = true;

        await trigger.click();
        const panel = page.locator('#khedmah-assistant-panel');
        await panel.waitFor({ state: 'visible' });
        const closeButton = panel.locator('button[aria-label="إغلاق المساعد"]').first();
        await closeButton.waitFor({ state: 'visible' });
        record.closeButtonVisible = true;
        await closeButton.focus();
        requireCondition(await closeButton.evaluate(element => element === document.activeElement), 'CLOSE_BUTTON_FOCUS_FAILED');
        record.closeButtonFocused = true;
        await page.keyboard.press('Enter');
        record.closeButtonActivated = true;
        await panel.waitFor({ state: 'detached' });
        record.closePanelDetached = true;
        await page.waitForFunction(() => {
          const currentTrigger = document.querySelector('[data-khedmah-assistant] button[aria-expanded]');
          return currentTrigger?.getAttribute('aria-expanded') === 'false' && currentTrigger === document.activeElement;
        }, null, { timeout: 6000 });
        record.closeFocusRestored = true;
        requireCondition(page.url() === url, 'ASSISTANT_CHANGED_ROUTE');
        // Focus and hit testing only: never click a main form's submit button.
        const last = await lastApplicationControl(page);
        if (last) {
          record.lastControlFocusStartedAt = await page.evaluate(() => performance.now());
          await last.scrollIntoViewIfNeeded(); await last.focus();
          record.lastControl = await last.evaluate(element => ({
            tag: element.tagName.toLowerCase(),
            ariaLabel: element.getAttribute('aria-label'),
            text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
          }));
          record.lastControlHitTest = await last.evaluate(browserControlReachability);
          record.lastControlReachable = record.lastControlHitTest.reachable;
          requireCondition(record.lastControlReachable, controlReachabilityFailure(record.lastControlHitTest));
        } else record.lastControlReachable = null;
        record.routePreservedAfterInteraction = page.url() === url;
        requireCondition(record.routePreservedAfterInteraction, 'INTERACTION_CHANGED_ROUTE');
        requireCondition(record.pageErrorCount === 0, 'BROWSER_RUNTIME_ERROR');
        record.status = 'passed';
      } catch (error) {
        record.failures.push(typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : error.name === 'TimeoutError' ? 'INTERACTION_TIMEOUT' : 'INTERACTION_FAILED');
      } finally {
        if (page) {
          try { record.mainFocusTrace = await page.evaluate(() => window.__khedmahReadMainFocusTrace?.() ?? []); }
          catch { record.focusTraceUnavailable = true; }
          try { record.screenshot = `${stem}-${record.status}.png`; await page.screenshot({ path: resolve(directory, record.screenshot), fullPage: true, timeout: 10000 }); }
          catch { record.failures.push('SCREENSHOT_UNAVAILABLE'); record.status = 'failed'; delete record.screenshot; }
        }
        if (context) {
          try { await context.close(); } catch { record.failures.push('CONTEXT_CLOSE_FAILED'); record.status = 'failed'; }
        }
      }
    }
    report.status = report.scenarios.length === expectedScenarios && report.scenarios.every(item => item.status === 'passed') ? 'passed' : 'failed';
  } catch {
    report.setupFailure = 'INTERACTION_SETUP_FAILED';
  } finally {
    if (browser) { try { await browser.close(); } catch { report.status = 'failed'; report.setupFailure = 'BROWSER_CLOSE_FAILED'; } }
    await writeFile(resolve(directory, 'interactions-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Mobile interactions: ${report.scenarios.filter(item => item.status === 'passed').length}/${expectedScenarios}; ${report.status}.`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if ((await main()).status !== 'passed') process.exitCode = 1;
}
