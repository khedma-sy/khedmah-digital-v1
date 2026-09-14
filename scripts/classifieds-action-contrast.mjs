// Computed browser paint, including theme and cascade overrides, is the authority.
// This gate covers text on enabled orange actions, not whole-page accessibility.
export function assessActionContrast(sample, minimum = 4.5) {
  const valid = (rgba) => Array.isArray(rgba) && rgba.length === 4
    && rgba.every((value) => Number.isFinite(value) && value >= 0 && value <= 255)
    && rgba[3] === 255;
  if (!sample.visible || !sample.label || sample.unsupportedPaint
      || sample.renderedOpacity !== 1
      || !valid(sample.foregroundRgba) || !valid(sample.backgroundRgba)) {
    return { status: 'failed', failure: 'ACTION_PAINT_NOT_MEASURABLE', ratio: null };
  }
  const luminance = (rgba) => rgba.slice(0, 3).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(sample.foregroundRgba);
  const b = luminance(sample.backgroundRgba);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { status: ratio >= minimum ? 'passed' : 'failed',
    failure: ratio >= minimum ? null : 'ACTION_TEXT_CONTRAST_BELOW_4_5', ratio };
}

export function assessActionFocus(sample) {
  const references = sample.focusBackgroundReferences ?? [];
  const ratios = references.map((backgroundRgba) => assessActionContrast({ ...sample,
    foregroundRgba: sample.outlineRgba, backgroundRgba }, 3).ratio);
  const passed = sample.focusVisible && Number.parseFloat(sample.outlineWidth) >= 2
    && sample.outlineStyle !== 'none' && references.length === 2
    && ratios.every((ratio) => Number.isFinite(ratio) && ratio >= 3);
  return { status: passed ? 'passed' : 'failed', failure: passed ? null : 'ACTION_FOCUS_CONTRAST_UNVERIFIED',
    reference: 'Computed theme canvas and surface paints; not a pixel audit of every surrounding gradient.', ratios };
}

export function browserActionPaint(element) {
  const style = getComputedStyle(element);
  // Canvas converts computed rgb()/color(srgb ...) to the same sRGB pixel format.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (color) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  let renderedOpacity = 1;
  let unsupportedPaint = style.backgroundImage !== 'none';
  for (let current = element; current; current = current.parentElement) {
    const currentStyle = getComputedStyle(current);
    renderedOpacity *= Number(currentStyle.opacity);
    unsupportedPaint ||= currentStyle.filter !== 'none' || currentStyle.mixBlendMode !== 'normal';
  }
  return {
    label: element.textContent.trim(),
    visible: element.getClientRects().length > 0 && style.visibility === 'visible',
    color: style.color, backgroundColor: style.backgroundColor,
    foregroundRgba: rgba(style.color), backgroundRgba: rgba(style.backgroundColor),
    renderedOpacity, unsupportedPaint,
    outlineColor: style.outlineColor, outlineWidth: style.outlineWidth,
    outlineStyle: style.outlineStyle, outlineRgba: rgba(style.outlineColor),
    focusBackgroundReferences: ['--k-color-canvas', '--k-color-surface'].map((name) => rgba(style.getPropertyValue(name).trim())),
    focusVisible: element.matches(':focus-visible')
  };
}

export async function measureClassifiedsActionContrast(page) {
  const actions = page.locator('main#foundation-content .ui-action-primary:visible');
  const count = await actions.count();
  const report = { status: 'failed', scope: 'Enabled action text contrast at rest, hover and keyboard focus; minimum 4.5:1.', samples: [], failures: [] };
  if (!count) report.failures.push('CLASSIFIEDS_PRIMARY_ACTIONS_MISSING');
  for (let index = 0; index < count; index += 1) {
    const action = actions.nth(index);
    if (!await action.isEnabled()) continue;
    for (const state of ['normal', 'hover', 'keyboard-focus']) {
      await page.mouse.move(0, 0);
      if (state === 'hover') await action.hover();
      if (state === 'keyboard-focus') {
        await action.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
      }
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const paint = await action.evaluate(browserActionPaint);
      const assessment = assessActionContrast(paint);
      if (state === 'keyboard-focus') {
        assessment.focus = assessActionFocus(paint);
        if (assessment.focus.status !== 'passed') {
          assessment.status = 'failed';
          assessment.failure = assessment.focus.failure;
        }
      }
      report.samples.push({ index, state, ...paint, ...assessment });
      await action.evaluate((element) => element.blur());
    }
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (!report.samples.length) report.failures.push('CLASSIFIEDS_ENABLED_ACTIONS_MISSING');
  report.failures.push(...new Set(report.samples.filter((sample) => sample.status !== 'passed').map((sample) => sample.failure)));
  report.status = report.failures.length ? 'failed' : 'passed';
  return report;
}
