import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceRoutes, evidenceThemes, validateBaseUrl } from './capture-preview-evidence.mjs';

export function assessAssistantGeometry(snapshot) {
  const failures = [];
  const { assistant, main, header, trigger, position, viewportWidth } = snapshot;
  const box = value => value && ['top', 'bottom', 'left', 'right', 'width', 'height'].every(key => Number.isFinite(value[key]));
  if (![assistant, main, header, trigger].every(box) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return ['GEOMETRY_UNAVAILABLE'];
  if (position !== 'static') failures.push('MOBILE_ASSISTANT_NOT_IN_FLOW');
  if (assistant.top < header.bottom - 1 || assistant.bottom > main.top + 1) failures.push('ASSISTANT_OVERLAPS_PAGE');
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
    checkoutSha: env.GITHUB_SHA || null, status: 'failed',
    scope: `Anonymous mobile UI only: ${evidenceRoutes.length} evidence routes at 320/390px and light/dark. Open/close assistant, Escape, focus return, and reachability of the last visible main control. Map-provider readiness is intentionally assessed by visual evidence, not duplicated here. No microphone, location permission, authentication, form submission or server writes.`, scenarios: [] };
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
        page.on('pageerror', () => { record.pageErrorCount += 1; });
        const response = await page.goto(new URL(route.path, origin).href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        requireCondition(response?.ok(), 'HTTP_NOT_SUCCESS');
        await waitForInteractionReadiness(page, Math.max(1, Math.min(30000, scenarioDeadline - Date.now())));
        requireCondition(new URL(page.url()).origin === origin && new URL(page.url()).pathname === route.path, 'UNEXPECTED_REDIRECT');
        record.geometry = await page.evaluate(assistantGeometry);
        record.failures.push(...assessAssistantGeometry(record.geometry));
        requireCondition(record.failures.length === 0, 'ASSISTANT_GEOMETRY_FAILED');
        const url = page.url();
        const trigger = page.getByRole('button', { name: 'فتح مساعد خدمة', exact: true });
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
        await page.getByRole('button', { name: 'إغلاق المساعد', exact: true }).click();
        await page.locator('#khedmah-assistant-panel').waitFor({ state: 'detached' });
        requireCondition(await trigger.evaluate(element => element === document.activeElement), 'CLOSE_FOCUS_NOT_RESTORED');
        record.closeFocusRestored = true;
        requireCondition(page.url() === url, 'ASSISTANT_CHANGED_ROUTE');
        // Focus and hit testing only: never click a main form's submit button.
        const controls = page.locator('main#foundation-content a[href]:visible, main#foundation-content button:not([disabled]):visible, main#foundation-content input:visible');
        if (await controls.count()) {
          const last = controls.last(); await last.scrollIntoViewIfNeeded(); await last.focus();
          record.lastControlReachable = await last.evaluate(element => {
            const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return element === document.activeElement && !!hit && element.contains(hit);
          });
          requireCondition(record.lastControlReachable, 'MAIN_CONTROL_OBSCURED');
        } else record.lastControlReachable = null;
        requireCondition(record.pageErrorCount === 0, 'BROWSER_RUNTIME_ERROR');
        record.status = 'passed';
      } catch (error) {
        record.failures.push(typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : error.name === 'TimeoutError' ? 'INTERACTION_TIMEOUT' : 'INTERACTION_FAILED');
      } finally {
        if (page) {
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
