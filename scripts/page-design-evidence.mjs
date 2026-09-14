import { assessActionContrast, browserActionPaint } from './classifieds-action-contrast.mjs';

// Anonymous form pages have their own navigation, rather than the public header.
// Keep the public eight-destination gate unchanged and evaluate this shell explicitly.
export function assessAuthEvidence(snapshot, shell, httpStatus, pathMatches, pageErrorCount, theme) {
  const failures = [];
  if (snapshot.theme !== theme) failures.push('THEME_NOT_APPLIED');
  if (!(httpStatus >= 200 && httpStatus < 300)) failures.push('HTTP_NOT_SUCCESS');
  if (!pathMatches) failures.push('UNEXPECTED_REDIRECT');
  if (snapshot.mainCount !== 1 || !snapshot.headingLength) failures.push('CONTENT_NOT_READY');
  if (!snapshot.authReady || snapshot.headerCount !== 1 || snapshot.navigationCount !== 0
      || !Number.isFinite(shell.headerHeight) || shell.headerHeight > 1 || shell.headerHeight < 0
      || shell.headerBrandCount !== 0 || shell.assistantCount !== 1) failures.push('AUTH_SHELL_NOT_READY');
  if (shell.brandCount !== 1 || shell.tabCount !== 2 || shell.currentTabCount !== 1 || !shell.switchHrefValid) failures.push('AUTH_NAVIGATION_NOT_READY');
  if (snapshot.busyCount !== 0) failures.push('LOADING_NOT_FINISHED');
  if (snapshot.alertCount !== 0) failures.push('VISIBLE_ERROR_OR_WARNING');
  if (snapshot.incompleteImageCount !== 0) failures.push('IMAGES_NOT_READY');
  if (snapshot.fontStatus !== 'loaded') failures.push('FONTS_NOT_READY');
  if (!Number.isFinite(snapshot.overflowPx) || snapshot.overflowPx > 1) failures.push('HORIZONTAL_OVERFLOW');
  if (!snapshot.formNamed) failures.push('FORM_NAME_MISSING');
  if (pageErrorCount !== 0) failures.push('BROWSER_RUNTIME_ERROR');
  return failures;
}

export function browserAuthShell() {
  const main = document.querySelector('main#foundation-content');
  const visible = (element) => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
  const elements = (selector) => [...main.querySelectorAll(selector)].filter(visible);
  const switchHref = elements('.auth-tabs a')[0]?.getAttribute('href');
  const header = document.querySelector('.khedma-header');
  return { brandCount: elements('.khedma-brand').length,
    headerHeight: header?.getBoundingClientRect().height ?? null,
    headerBrandCount: [...document.querySelectorAll('.khedma-header > a')].filter(visible).length,
    assistantCount: [...document.querySelectorAll('.khedma-header [data-khedmah-assistant]')].filter(visible).length,
    tabCount: elements('.auth-tabs > *').length,
    currentTabCount: elements('.auth-tabs [aria-current="page"]').length,
    switchHrefValid: switchHref === (location.pathname === '/auth/login' ? '/auth/register' : '/auth/login') };
}

export function browserDesignLayout(key) {
  const main = document.querySelector('main#foundation-content');
  const visible = (element) => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
  const samples = [];
  const measure = (element, label, minimumPadding, minimumGap = 0) => {
    if (!visible(element)) return;
    const style = getComputedStyle(element);
    samples.push({ label, minimumPadding, minimumGap,
      padding: Math.min(...['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((name) => Number.parseFloat(style[name]))),
      gap: Math.min(Number.parseFloat(style.rowGap) || 0, Number.parseFloat(style.columnGap) || 0) });
  };
  if (key === 'search') measure(main.querySelector('form[aria-label="البحث في خدمة"]'), 'discovery form', 16, 16);
  if (key === 'food') {
    main.querySelectorAll('[aria-labelledby="food-categories-title"] article').forEach((element, index) => measure(element, `food category ${index + 1}`, 16));
    measure(main.querySelector('a[href="/business-profiles/new"]')?.parentElement, 'food business entry', 16);
  }
  if (key === 'taxi' || key === 'taxi-signup') main.querySelectorAll(':scope > .ui-container > .ui-surface').forEach((element, index) => measure(element, `taxi panel ${index + 1}`, 16));
  if (key === 'login' || key === 'register') measure(main.querySelector('form.auth-panel'), 'account form', 16);
  const rootStyle = getComputedStyle(document.documentElement);
  return { key, htmlDir: document.documentElement.dir, direction: getComputedStyle(main).direction,
    missingTokens: ['--k-space-2', '--k-space-3', '--k-space-4', '--k-space-5', '--k-space-6', '--k-radius-pill', '--k-shadow-xl'].filter((name) => !rootStyle.getPropertyValue(name).trim()),
    samples,
    signup: key === 'taxi-signup' ? {
      loginHref: main.querySelector('a[href^="/auth/login?next="]')?.getAttribute('href'),
      formCount: main.querySelectorAll('form').length,
      stepCount: main.querySelectorAll('ol[aria-label="مراحل اعتماد سائق التكسي"] > li').length
    } : null };
}

export function assessDesignLayout(snapshot) {
  const failures = [];
  if (snapshot.htmlDir !== 'rtl' || snapshot.direction !== 'rtl') failures.push('RTL_NOT_APPLIED');
  if (!Array.isArray(snapshot.missingTokens) || snapshot.missingTokens.length) failures.push('DESIGN_TOKENS_UNRESOLVED');
  const minimumSamples = { search: 1, food: 5, taxi: 1, 'taxi-signup': 2, login: 1, register: 1 }[snapshot.key] ?? 0;
  if (!Array.isArray(snapshot.samples) || snapshot.samples.length < minimumSamples) failures.push('DESIGN_SURFACES_MISSING');
  for (const sample of snapshot.samples ?? []) {
    if (!Number.isFinite(sample.padding) || sample.padding < sample.minimumPadding - 0.1) failures.push('SURFACE_PADDING_MISSING');
    if (!Number.isFinite(sample.gap) || sample.gap < sample.minimumGap - 0.1) failures.push('CONTROL_GAP_MISSING');
  }
  if (snapshot.key === 'taxi-signup' && (snapshot.signup?.loginHref !== '/auth/login?next=%2Ftaxi-driver-signup' || snapshot.signup?.formCount !== 0 || snapshot.signup?.stepCount !== 6)) failures.push('GUEST_DRIVER_JOURNEY_INVALID');
  return { status: failures.length ? 'failed' : 'passed', failures: [...new Set(failures)] };
}

export async function measurePageDesign(page, key) {
  const layout = await page.evaluate(browserDesignLayout, key);
  const assessment = assessDesignLayout(layout);
  const samples = [];
  if (['categories', 'food', 'store', 'map', 'taxi', 'restaurants'].includes(key)) {
    const icons = key === 'categories';
    const selector = icons ? 'main .catalog-category-icon' : key === 'restaurants' ? 'main .ui-action-primary, main .ui-action-secondary' : key !== 'food' ? 'main .ui-action-primary' : 'main [aria-labelledby="food-categories-title"] article a, main a[href="/business-profiles/new"], main a[href="/restaurants"]';
    const elements = page.locator(selector);
    const count = await elements.count();
    if (count < (key === 'food' ? 6 : 1)) assessment.failures.push('DESIGN_CONTRAST_TARGETS_MISSING');
    for (let index = 0; index < count; index++) {
      const element = elements.nth(index);
      for (const state of icons ? ['normal'] : ['normal', 'hover', 'keyboard-focus']) {
        await page.mouse.move(0, 0);
        if (state === 'hover') await element.hover();
        if (state === 'keyboard-focus') {
          await element.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
        }
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const paint = await element.evaluate(browserActionPaint);
        if (icons) paint.label = await element.getAttribute('data-category-tone');
        const result = assessActionContrast(paint, icons ? 3 : 4.5);
        samples.push({ index, state, ...paint, ...result });
        if (result.status !== 'passed') assessment.failures.push(icons ? 'CATEGORY_ICON_CONTRAST_FAILED' : `${key.toUpperCase()}_ACTION_CONTRAST_FAILED`);
        if (!icons) await element.evaluate((node) => node.blur());
      }
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  assessment.failures = [...new Set(assessment.failures)];
  assessment.status = assessment.failures.length ? 'failed' : 'passed';
  return { ...assessment, layout, contrastSamples: samples,
    scope: 'Rendered spacing and RTL; category icon contrast >=3; solid Food, Store, Map, Taxi and Restaurant action text >=4.5 in three states. No whole-page accessibility or background-gradient certification.' };
}
