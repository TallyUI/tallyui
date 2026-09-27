import { defineConfig } from 'tsup';

export default defineConfig({
  // An object entry map, so the rxdb subpath builds to dist/rxdb/ (`@tallyui/core/rxdb`), apart
  // from the main entry, which stays free of rxdb and rxjs.
  entry: { index: 'src/index.ts', 'rxdb/index': 'src/rxdb/index.ts' },
  format: ['esm'],
  dts: true,
  external: ['react', 'rxdb', 'rxjs'],
});
