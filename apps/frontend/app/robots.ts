import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.uk';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/search', '/business-profiles', '/professional-profiles', '/categories'],
        disallow: ['/admin', '/users/me', '/businesses/new', '/business-profiles/new', '/professional-profiles/new', '/auth']
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
