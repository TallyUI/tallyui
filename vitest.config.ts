import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/**/*.test.{ts,tsx}', 'connectors/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      // Monorepo package aliases — resolve to source for fast feedback
      '@tallyui/core': path.resolve(__dirname, 'packages/core/src'),
      '@tallyui/database': path.resolve(__dirname, 'packages/database/src'),
      '@tallyui/components': path.resolve(__dirname, 'packages/components/src'),
      '@tallyui/connector-woocommerce': path.resolve(__dirname, 'connectors/woocommerce/src'),
      '@tallyui/connector-medusa': path.resolve(__dirname, 'connectors/medusa/src'),
      // React Native → Web for component rendering in tests
      'react-native': 'react-native-web',
      // Deduplicate React to a single copy (prevents "multiple copies" errors)
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
});
