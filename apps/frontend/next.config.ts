import type { NextConfig } from 'next';

const backendOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
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
