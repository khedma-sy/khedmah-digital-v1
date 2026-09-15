// Diagnostic instrumentation in an anonymous CI browser only. No production
// bundle imports this module. Forward focus unchanged; retain no field values,
// DOM text, query strings, fragments, cookies or provider internals.
export function installMainFocusTrace() {
  const entries = [];
  const retain = entry => { entries.push(entry); if (entries.length > 20) entries.shift(); };
  const originalFocus = HTMLElement.prototype.focus;
  const isMain = element => element?.matches?.('main#foundation-content');
  const owner = element => element?.closest?.('[data-map-surface="true"]') ? 'map-provider'
    : element?.closest?.('[data-khedmah-assistant]') ? 'assistant'
    : element?.closest?.('main#foundation-content') ? 'application' : 'outside-main';
  const callers = () => (new Error().stack || '').split('\n').slice(2, 10).map(line => {
    const functionName = line.match(/^\s*at ([\w.$<>]+)/)?.[1] || 'anonymous';
    const rawUrl = line.match(/https?:\/\/[^\s)]+/)?.[0];
    let source = 'inline';
    if (rawUrl) {
      try {
        const url = new URL(rawUrl);
        source = url.origin === location.origin && url.pathname.startsWith('/_next/static/')
          ? `application:${url.pathname.split('/').pop()}`
          : /^(maps\.googleapis\.com|maps\.gstatic\.com)$/.test(url.hostname) ? 'google-maps' : 'external';
      } catch { source = 'unknown'; }
    }
    return { functionName, source };
  });
  HTMLElement.prototype.focus = function (...args) {
    if (isMain(this)) retain({ kind: 'call', time: performance.now(), fromTag: document.activeElement?.tagName?.toLowerCase() ?? null,
      fromOwner: owner(document.activeElement), callers: callers() });
    return Reflect.apply(originalFocus, this, args);
  };
  document.addEventListener('focusin', event => {
    if (isMain(event.target)) retain({ kind: 'event', time: performance.now(), fromTag: event.relatedTarget?.tagName?.toLowerCase() ?? null,
      fromOwner: owner(event.relatedTarget) });
  });
  window.__khedmahReadMainFocusTrace = () => entries.slice();
}
