import { mkdir, writeFile } from 'node:fs/promises';
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
  { key: 'taxi-signup', path: '/taxi-driver-signup', href: '/taxi-driver-signup', formName: '' },
  { key: 'login', path: '/auth/login', href: '/auth/login', formName: 'تسجيل الدخول', authShell: true },
  { key: 'register', path: '/auth/register', href: '/auth/register', formName: 'إنشاء حساب', authShell: true }
]);

const expectedScenarios = sixthAuditRoutes.length * evidenceViewports.length * evidenceThemes.length;

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

export async function main(env = process.env) {
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  await mkdir(directory, { recursive: true });
  const report = {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    headSha: env.PREVIEW_HEAD_SHA || null,
    checkoutSha: env.GITHUB_SHA || null,
    status: 'failed',
    expectedScenarios,
    scope: 'Anonymous After-only visual readiness for Restaurants, independent Delivery, Classifieds, guest Taxi signup, Login and Register. Four governed viewports, light/dark, RTL. Account pages use an explicit auth-shell gate. No credentials, authentication, location permission, form submission or server writes.',
    scenarios: []
  };
  let browser;
  try {
    const origin = validateBaseUrl(env.AFTER_URL);
    if (!env.PLAYWRIGHT_PACKAGE_JSON?.trim()) throw new Error('BROWSER_TOOLING_PATH_MISSING');
    const { chromium } = createRequire(resolve(env.PLAYWRIGHT_PACKAGE_JSON))('playwright');
    browser = await chromium.launch({ headless: true });
    const globalDeadline = Date.now() + 600000;

    for (const route of sixthAuditRoutes) {
      for (const viewport of evidenceViewports) {
        for (const theme of evidenceThemes) {
          const record = {
            route: route.href,
            key: route.key,
            viewport: viewport.key,
            width: viewport.width,
            height: viewport.height,
            theme,
            status: 'failed',
            failures: [],
            pageErrorCount: 0
          };
          report.scenarios.push(record);
          if (Date.now() >= globalDeadline) {
            record.failures.push('SIXTH_AUDIT_GLOBAL_DEADLINE_EXCEEDED');
            continue;
          }
          let context;
          let page;
          try {
            context = await browser.newContext({
              viewport: { width: viewport.width, height: viewport.height },
              locale: 'ar-SY',
              colorScheme: theme,
              reducedMotion: 'reduce',
              deviceScaleFactor: 1
            });
            page = await context.newPage();
            page.on('pageerror', () => { record.pageErrorCount += 1; });
            const response = await page.goto(new URL(route.href, origin).href, {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            });
            record.httpStatus = response?.status() ?? 0;
            try {
              await waitForCaptureReadiness(page, Math.max(1, Math.min(30000, globalDeadline - Date.now())));
            } catch {
              record.failures.push('READINESS_TIMEOUT');
            }
            try {
              record.imageReadiness = await page.evaluate(browserPrepareFullPageCapture);
            } catch {
              record.failures.push('IMAGE_READINESS_ERROR');
            }
            try {
              await waitForCaptureReadiness(page, Math.max(1, Math.min(30000, globalDeadline - Date.now())));
            } catch {
              record.failures.push('FINAL_READINESS_TIMEOUT');
            }
            const current = new URL(page.url());
            record.snapshot = await page.evaluate(browserSnapshot, route.formName);
            record.direction = await page.evaluate(directionSnapshot);
            if (route.authShell) {
              record.authShell = await page.evaluate(browserAuthShell);
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
              record.actionContrast = await measureClassifiedsActionContrast(page);
              record.failures.push(...record.actionContrast.failures);
            }
            record.pageDesign = await measurePageDesign(page, route.key);
            record.failures.push(...record.pageDesign.failures);
            // Check after keyboard traversal, which can scroll hidden RTL overflow
            // and clip unrelated headings even when document overflow is zero.
            record.inlineLayout = await page.evaluate(browserInlineLayout);
            record.inlineLayoutAssessment = assessInlineLayout(record.inlineLayout);
            record.failures.push(...record.inlineLayoutAssessment.failures);
            record.status = record.failures.length ? 'failed' : 'passed';
          } catch (error) {
            record.failures.push(error?.name === 'TimeoutError' ? 'SIXTH_AUDIT_TIMEOUT' : 'SIXTH_AUDIT_CAPTURE_ERROR');
          } finally {
            if (page) {
              try {
                record.screenshot = `sixth-after-${route.key}-${viewport.key}-${theme}${record.status === 'passed' ? '' : '-diagnostic'}.png`;
                await page.screenshot({ path: resolve(directory, record.screenshot), fullPage: true, timeout: 12000 });
              } catch {
                record.failures.push('SCREENSHOT_UNAVAILABLE');
                record.status = 'failed';
                delete record.screenshot;
              }
            }
            if (context) {
              try { await context.close(); }
              catch { record.failures.push('CONTEXT_CLOSE_FAILED'); record.status = 'failed'; }
            }
          }
        }
      }
    }
    report.status = report.scenarios.length === expectedScenarios
      && report.scenarios.every((scenario) => scenario.status === 'passed') ? 'passed' : 'failed';
  } catch (error) {
    report.setupFailure = error?.message === 'BROWSER_TOOLING_PATH_MISSING'
      ? 'BROWSER_TOOLING_PATH_MISSING'
      : 'SIXTH_AUDIT_SETUP_FAILED';
  } finally {
    if (browser) {
      try { await browser.close(); }
      catch { report.status = 'failed'; report.setupFailure = 'BROWSER_CLOSE_FAILED'; }
    }
    await writeFile(resolve(directory, 'sixth-audit-visual-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  const passed = report.scenarios.filter((scenario) => scenario.status === 'passed').length;
  console.log(`Sixth audit visual evidence: ${passed}/${expectedScenarios}; ${report.status}.`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if ((await main()).status !== 'passed') process.exitCode = 1;
}
