import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBaseUrl } from './capture-preview-evidence.mjs';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const requireCondition = (value, code) => { if (!value) fail(code); };

function isAdsEnvelope(value) {
  return !!value && typeof value === 'object' && Array.isArray(value.ads);
}

export async function main(env = process.env) {
  const directory = resolve(env.EVIDENCE_DIR || 'preview-evidence');
  await mkdir(directory, { recursive: true });
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    headSha: env.PREVIEW_HEAD_SHA || null,
    checkoutSha: env.GITHUB_SHA || null,
    status: 'failed',
    scope: 'Read-only anonymous acceptance for the deployed Classifieds page and its /api/v1/classifieds data path. No authentication, mutations, uploads, moderation, or test data creation.',
    frontendUrl: null,
    backendUrl: null,
    pageStatus: null,
    proxiedApiStatus: null,
    directBackendStatus: null,
    adCount: null,
    disabledMessagePresent: null,
    searchVisible: null,
    createLinkVisible: null,
    manageLinkVisible: null,
    screenshot: null,
    failures: []
  };
  let browser;
  let context;
  let page;
  try {
    const frontendOrigin = validateBaseUrl(env.AFTER_URL);
    const backendOrigin = validateBaseUrl(env.BACKEND_URL);
    report.frontendUrl = frontendOrigin;
    report.backendUrl = backendOrigin;
    requireCondition(env.PLAYWRIGHT_PACKAGE_JSON?.trim(), 'BROWSER_TOOLING_PATH_MISSING');
    const { chromium } = createRequire(resolve(env.PLAYWRIGHT_PACKAGE_JSON))('playwright');

    const direct = await fetch(new URL('/api/v1/classifieds', backendOrigin), { headers: { accept: 'application/json' } });
    report.directBackendStatus = direct.status;
    requireCondition(direct.status === 200, 'DIRECT_BACKEND_CLASSIFIEDS_NOT_200');
    requireCondition(isAdsEnvelope(await direct.json()), 'DIRECT_BACKEND_CLASSIFIEDS_INVALID');

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-SY', colorScheme: 'light', reducedMotion: 'reduce' });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    let pageErrors = 0;
    page.on('pageerror', () => { pageErrors += 1; });

    const apiResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.origin === frontendOrigin && url.pathname === '/api/v1/classifieds';
    }, { timeout: 25000 });

    const pageResponse = await page.goto(new URL('/classifieds', frontendOrigin).href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    report.pageStatus = pageResponse?.status() ?? null;
    requireCondition(pageResponse?.ok(), 'CLASSIFIEDS_PAGE_NOT_200');
    await page.getByRole('heading', { name: 'الإعلانات المبوبة', exact: true }).waitFor({ state: 'visible' });

    report.disabledMessagePresent = await page.getByText('إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة.', { exact: true }).count() > 0;
    requireCondition(!report.disabledMessagePresent, 'CLASSIFIEDS_FRONTEND_STILL_DISABLED');

    const search = page.locator('form[role="search"][aria-label="البحث في إعلانات خدمة"]');
    await search.waitFor({ state: 'visible' });
    report.searchVisible = true;
    await page.getByRole('link', { name: 'أضف إعلانًا', exact: true }).first().waitFor({ state: 'visible' });
    report.createLinkVisible = true;
    await page.getByRole('link', { name: 'إعلاناتي', exact: true }).first().waitFor({ state: 'visible' });
    report.manageLinkVisible = true;

    const apiResponse = await apiResponsePromise;
    report.proxiedApiStatus = apiResponse.status();
    requireCondition(apiResponse.status() === 200, 'CLASSIFIEDS_PROXY_API_NOT_200');
    const envelope = await apiResponse.json();
    requireCondition(isAdsEnvelope(envelope), 'CLASSIFIEDS_PROXY_API_INVALID');
    report.adCount = envelope.ads.length;

    await page.waitForFunction(() => {
      return !!document.querySelector('[aria-label="الإعلانات المنشورة"]') || document.body.innerText.includes('لا توجد إعلانات مطابقة');
    }, null, { timeout: 15000 });
    requireCondition(pageErrors === 0, 'CLASSIFIEDS_BROWSER_RUNTIME_ERROR');

    report.screenshot = 'classifieds-preview-acceptance.png';
    await page.screenshot({ path: resolve(directory, report.screenshot), fullPage: true, timeout: 15000 });
    report.status = 'passed';
  } catch (error) {
    report.failures.push(typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : error?.name === 'TimeoutError' ? 'CLASSIFIEDS_ACCEPTANCE_TIMEOUT' : 'CLASSIFIEDS_ACCEPTANCE_FAILED');
    if (page) {
      try {
        report.screenshot = 'classifieds-preview-acceptance-failed.png';
        await page.screenshot({ path: resolve(directory, report.screenshot), fullPage: true, timeout: 10000 });
      } catch {
        report.failures.push('CLASSIFIEDS_ACCEPTANCE_SCREENSHOT_UNAVAILABLE');
      }
    }
  } finally {
    if (context) { try { await context.close(); } catch { report.failures.push('CLASSIFIEDS_CONTEXT_CLOSE_FAILED'); report.status = 'failed'; } }
    if (browser) { try { await browser.close(); } catch { report.failures.push('CLASSIFIEDS_BROWSER_CLOSE_FAILED'); report.status = 'failed'; } }
    await writeFile(resolve(directory, 'classifieds-acceptance-manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Classifieds Preview acceptance: ${report.status}; page=${report.pageStatus}; proxy=${report.proxiedApiStatus}; backend=${report.directBackendStatus}; ads=${report.adCount ?? 'unknown'}.`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if ((await main()).status !== 'passed') process.exitCode = 1;
}
