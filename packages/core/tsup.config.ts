import { defineConfig } from 'tsup';

export default defineConfig({
  // Subpaths stay out of the main entry: rxdb carries the RxDB helpers, and server carries
  // the plugins' contract, including node:crypto. The main entry stays free of all three.
  entry: { index: 'src/index.ts', 'rxdb/index': 'src/rxdb/index.ts', 'server/index': 'src/server/index.ts' },
  format: ['esm'],
  dts: true,
  external: ['react', 'rxdb', 'rxjs'],
  // tsup strips the `node:` prefix by default; keeping it makes the server bundle portable
  // (Deno, Workers) and lets check-core-dist's `node:` check fire.
  removeNodeProtocol: false,
});
