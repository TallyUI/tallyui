import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Optimize icon imports to reduce client JavaScript.
  experimental: { optimizePackageImports: ['lucide-react'] },
  // The browserslist in package.json has every feature Next's polyfill module patches natively.
  // next/dist/client/app-globals.js requires it by the relative path, so both keys are needed.
  turbopack: {
    resolveAlias: {
      'next/dist/build/polyfills/polyfill-module': './src/lib/no-polyfills.js',
      '../build/polyfills/polyfill-module': './src/lib/no-polyfills.js',
    },
  },
  async rewrites() {
    return [
      {
        source: '/docs/:path*.mdx',
        destination: '/llms.mdx/docs/:path*',
      },
      // iOS and crawlers ask for /apple-touch-icon.png by name (marketing backlog item 84).
      {
        source: '/apple-touch-icon.png',
        destination: '/apple-icon.png',
      },
    ];
  },
  // Security headers, matching medusapos.com and vendurepos.com (marketing backlog item 83). Vercel adds HSTS.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withMDX(config);
