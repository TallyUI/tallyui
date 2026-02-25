import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  external: ['react', 'react-native', '@tallyui/core', '@tallyui/primitives', '@tallyui/theme'],
});
