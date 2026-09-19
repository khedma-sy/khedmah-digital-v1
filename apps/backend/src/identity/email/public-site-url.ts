export function getPublicSiteUrl(): string {
  const environment = process.env.NODE_ENV?.trim().toLowerCase() || 'development';
  const deployed = environment !== 'development' && environment !== 'test';
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    if (deployed) throw new Error('CRITICAL: NEXT_PUBLIC_SITE_URL must be configured in production and all other deployed environments.');
    return 'http://localhost:3000';
  }

  let url: URL;
  try { url = new URL(configured); } catch { throw new Error('NEXT_PUBLIC_SITE_URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTP(S) URL without credentials, query or fragment.');
  }
  if (deployed && (url.protocol !== 'https:' || /^(localhost|127\..*|\[::1\])$/.test(url.hostname) || url.hostname.endsWith('.localhost'))) {
    throw new Error('CRITICAL: NEXT_PUBLIC_SITE_URL must use a non-local HTTPS origin in deployed environments.');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

export function buildPublicActionUrl(path: string, token: string): string {
  const base = getPublicSiteUrl();
  const url = new URL(path, `${base}/`);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || url.origin !== new URL(base).origin) {
    throw new Error('Email action must remain on the configured site.');
  }
  url.searchParams.set('token', token);
  return url.toString();
}
