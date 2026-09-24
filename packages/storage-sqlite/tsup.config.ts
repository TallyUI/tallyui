import { defineConfig } from 'tsup';

export default defineConfig({
  // An object entry map, rather than an array, so the web build keeps its
  // "web/" subpath in dist instead of flattening onto the root entry's name.
  entry: {
    index: 'src/index.ts',
    'web/index': 'src/web/index.ts',
    'web/worker': 'src/web/worker.ts',
  },
  format: ['esm'],
  dts: true,
  external: ['rxdb', 'rxjs', 'expo-sqlite', '@sqlite.org/sqlite-wasm', /^rxdb-premium(\/|$)/],
});
