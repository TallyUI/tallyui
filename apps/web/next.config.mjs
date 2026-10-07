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
    ];
  },
};

export default withMDX(config);
