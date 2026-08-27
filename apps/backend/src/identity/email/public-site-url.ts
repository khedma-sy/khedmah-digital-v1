export function getPublicSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL: NEXT_PUBLIC_SITE_URL must be configured in production.');
    }
    return 'http://localhost:3000';
  }

  const url = new URL(configured);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('CRITICAL: NEXT_PUBLIC_SITE_URL must use HTTPS in production.');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function buildPublicActionUrl(path: string, token: string): string {
  const url = new URL(path, `${getPublicSiteUrl()}/`);
  url.searchParams.set('token', token);
  return url.toString();
}
