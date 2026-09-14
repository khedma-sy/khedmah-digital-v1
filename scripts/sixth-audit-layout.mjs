// Document scrollWidth alone misses overflow clipped by the PageShell.
export function assessInlineLayout(snapshot) {
  const failures = [];
  if (!Number.isFinite(snapshot.viewportWidth) || snapshot.viewportWidth <= 0
      || !Number.isFinite(snapshot.mainOverflowPx) || !snapshot.elements?.length) {
    return { status: 'failed', failures: ['INLINE_LAYOUT_NOT_MEASURABLE'] };
  }
  if (snapshot.mainOverflowPx > 1) failures.push('MAIN_INLINE_OVERFLOW');
  for (const element of snapshot.elements) {
    if (![element.left, element.right, element.width].every(Number.isFinite) || element.width <= 0) {
      failures.push('INLINE_ELEMENT_NOT_MEASURABLE');
    } else if (element.left < -1 || element.right > snapshot.viewportWidth + 1) {
      failures.push('CRITICAL_ELEMENT_CLIPPED_INLINE');
    }
  }
  return { status: failures.length ? 'failed' : 'passed', failures: [...new Set(failures)] };
}

export function browserInlineLayout() {
  const main = document.querySelector('main#foundation-content');
  const selectors = [
    ':scope > .ui-container', '.ui-page-header', 'h1', '.ui-page-heading p',
    'form[role="search"]', 'form[role="search"] input', 'form[role="search"] select',
    'form[role="search"] textarea', 'form[role="search"] button',
    '.ui-page-actions .ui-action', '.ui-empty'
  ];
  const elements = main ? [...main.querySelectorAll(selectors.join(','))].filter((element) => {
    const style = getComputedStyle(element);
    return element.getClientRects().length > 0 && style.visibility === 'visible';
  }).map((element) => {
    const bounds = element.getBoundingClientRect();
    return { tag: element.tagName.toLowerCase(),
      label: (element.getAttribute('aria-label') || element.getAttribute('name') || element.textContent || '').trim().slice(0, 100),
      left: bounds.left, right: bounds.right, width: bounds.width };
  }) : [];
  return { viewportWidth: document.documentElement.clientWidth,
    mainOverflowPx: main ? main.scrollWidth - main.clientWidth : null,
    mainScrollLeft: main?.scrollLeft ?? null, elements };
}
