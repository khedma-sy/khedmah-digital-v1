import type { NextConfig } from 'next';

const backendOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
    : [])
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...securityHeaders]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendOrigin}/api/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
