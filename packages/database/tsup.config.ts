import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  external: ['rxdb', 'rxdb/plugins/dev-mode', 'rxdb/plugins/storage-memory', 'rxjs', '@tallyui/core'],
});
