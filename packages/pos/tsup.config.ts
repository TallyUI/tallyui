import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  external: [
    'react',
    '@tallyui/core',
    'rxdb',
    'rxdb/plugins/storage-memory',
    'rxjs',
  ],
});
