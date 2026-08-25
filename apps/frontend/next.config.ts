import type { NextConfig } from 'next';

const backendOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
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
